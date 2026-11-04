import {
  AmbientLight,
  ClampToEdgeWrapping,
  CylinderGeometry,
  DirectionalLight,
  FrontSide,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Camera,
  type Color,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
} from "three";
import {
  CSS3DObject,
  CSS3DSprite,
} from "three/addons/renderers/CSS3DRenderer.js";
import * as C3R from "c3r";

export { CSS3DObject, CSS3DSprite };

// The material fields we read, present on MeshBasicMaterial, SpriteMaterial etc.
type MappedMaterial = Material & { map?: Texture | null; color?: Color };

// Missing from @types/three
type RotatedSprite = CSS3DSprite & { rotation2D?: number };

interface Range {
  start: number;
  count: number;
  materialIndex: number;
}

interface MeshState {
  key: unknown[];
  groups: { node: C3R.Group; polygons: C3R.Polygon[] }[];
  fitted?: C3R.ShadowCaster | null;
  caster: C3R.ShadowCaster | null;
  receiver?: C3R.Material;
}

interface ShadowLight {
  ambient: number;
  level: number;
  position: NonNullable<C3R.Lights["point"]>["position"] | null;
  blur: number;
}

interface MaterialState {
  material: C3R.Material;
  map: Texture | null | undefined;
  version: number;
  // The canvas map's data url, encoding it is slow
  canvasSrc: string;
}

const DEFAULT_CENTER = { x: 0.5, y: 0.5 };
// A plain color needs pixels only for its edges, smaller saves tile memory
const flatDomSize = (size: number) => Math.max(128, Math.min(size, 1200));
const _matrix = new Matrix4();
const _parent = new Matrix4();
const _position = new Vector3();
const _direction = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();
const _rgb = { r: 0, g: 0, b: 0 };
const RAD2DEG = 180 / Math.PI;

const shadingOf = (material: Material): C3R.Shading | null =>
  material instanceof MeshLambertMaterial ||
  material instanceof MeshPhongMaterial ||
  material instanceof MeshStandardMaterial
    ? material.flatShading
      ? "flat"
      : "smooth"
    : null;

const luminance = ({ r, g, b }: Color) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Divided by π like three.js' diffuse, so a scene is as bright as under WebGL
const lightLevel = ({
  color,
  intensity,
}: AmbientLight | DirectionalLight | PointLight) =>
  (intensity * luminance(color)) / Math.PI;

// three.js' BRDF_BlinnPhong without Fresnel, relative to the level above
const specularOf = (material: Material): C3R.Specular | null => {
  if (!(material instanceof MeshPhongMaterial)) return null;
  const { shininess } = material;
  const intensity = (luminance(material.specular) * (shininess / 2 + 1)) / 4;
  return intensity > 0 && shininess > 0 ? { intensity, shininess } : null;
};

const casterOf = (geometry: BufferGeometry): C3R.ShadowCaster | null => {
  if (geometry instanceof SphereGeometry) {
    geometry.computeBoundingSphere();
    const { center, radius } = geometry.boundingSphere!;
    return radius > 0
      ? { shape: "sphere", radius, center: center.toArray() }
      : null;
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  if (box.isEmpty()) return null;
  const center = box.getCenter(new Vector3()).toArray();
  const size = box.getSize(new Vector3()).toArray();
  if (geometry instanceof CylinderGeometry) {
    const { radiusTop, radiusBottom, height } = geometry.parameters;
    const radius = Math.max(radiusTop, radiusBottom);
    // Rotated vertices leave the parameters along y
    if (radius > 0 && height > 0 && Math.abs(size[1] - height) <= 1e-6 * height)
      return { shape: "cylinder", radius, height, center };
  }
  const largest = Math.max(...size);
  if (!(largest > 0)) return null;
  // A plane casts too, a box can't be flat
  const [x, y, z] = size.map((n) => Math.max(n, largest * 1e-3));
  return { shape: "box", size: [x, y, z], center };
};

export interface C3RRendererOptions {
  shading?: boolean;
  // Needs shading
  specular?: boolean;
  // Needs shading, blur in scene units softens them
  shadows?: boolean | { readonly blur: number };
}

export class C3RRenderer {
  readonly domElement: HTMLDivElement = document.createElement("div");

  shading: boolean;
  specular: boolean;
  shadows: boolean | { readonly blur: number };

  #shadowLight: ShadowLight | null = null;
  // Whether this render moved anything a shadow follows
  #changed = false;
  #lights = new WeakMap<C3R.Container, string>();
  // Those last rendered with shadows, cast once more when they turn off
  #casting = new WeakSet<C3R.Container>();
  #width = 0;
  #height = 0;
  #containers = new Map<Scene, C3R.Container>(); // multiple scenes can overlap
  #children = new WeakMap<C3R.Group, Map<Object3D, C3R.Group>>();
  #meshes = new WeakMap<C3R.Group, MeshState>();
  #materials = new WeakMap<Material, MaterialState>();
  #poses = new WeakMap<C3R.Group | C3R.Camera, number[]>();

  constructor({
    shading = false,
    specular = false,
    shadows = false,
  }: C3RRendererOptions = {}) {
    this.shading = shading;
    this.specular = specular;
    this.shadows = shadows;
  }

  getSize(): { width: number; height: number } {
    return { width: this.#width, height: this.#height };
  }

  setSize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;

    this.domElement.style.width = `${width}px`;
    this.domElement.style.height = `${height}px`;

    for (const container of this.#containers.values()) {
      container.setSize(width, height);
    }
  }

  dispose(): void {
    for (const container of this.#containers.values()) {
      container.domElement.remove();
      container.camera[Symbol.dispose]();
    }
    this.#containers.clear();
  }

  render(scene: Scene, camera: Camera): void {
    let container = this.#containers.get(scene);
    if (!container) {
      container = new C3R.Container();
      container.domElement.style.position = "absolute";
      container.setSize(this.#width, this.#height);
      this.domElement.appendChild(container.domElement);
      this.#containers.set(scene, container);
    }

    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (camera.parent === null && camera.matrixWorldAutoUpdate)
      camera.updateMatrixWorld();

    this.#changed = false;
    this.#syncCamera(container, camera);
    if (this.shading) this.#syncLights(scene, container);
    else this.#shadowLight = null;
    this.#syncObject(scene, container.root, camera);
    const casting = this.shading && !!this.shadows;
    void container.bake({
      shadows: this.#changed && (casting || this.#casting.has(container)),
    });
    if (casting) this.#casting.add(container);
    else this.#casting.delete(container);
  }

  #syncLights(scene: Scene, container: C3R.Container): void {
    let ambient = 0;
    let light: DirectionalLight | PointLight | undefined;
    let directional: C3R.Lights["directional"];
    let point: C3R.Lights["point"];
    scene.traverseVisible((object) => {
      if (object instanceof AmbientLight) ambient += lightLevel(object);
      if (light) return;
      if (!(object instanceof DirectionalLight || object instanceof PointLight))
        return;
      const intensity = lightLevel(object);
      if (intensity <= 0) return;
      _position.setFromMatrixPosition(object.matrixWorld);
      if (object instanceof PointLight) {
        point = { position: _position.toArray(), intensity };
        light = object;
        return;
      }
      _direction
        .setFromMatrixPosition(object.target.matrixWorld)
        .sub(_position);
      if (!_direction.lengthSq()) return;
      directional = { direction: _direction.toArray(), intensity };
      light = object;
    });
    ambient = Math.max(0, ambient);
    const lights = { ambient: { intensity: ambient }, directional, point };
    const { shadows } = this;
    this.#shadowLight =
      shadows && light?.castShadow
        ? {
            ambient,
            level: (point ?? directional)!.intensity,
            position: point?.position ?? null,
            blur: shadows === true ? 0 : shadows.blur,
          }
        : null;
    const key = JSON.stringify([lights, !!this.#shadowLight]);
    if (this.#lights.get(container) === key) return;
    this.#lights.set(container, key);
    container.lights = lights;
    this.#changed = true;
  }

  async toHTML(): Promise<string> {
    await Promise.all([...this.#containers.values()].map((c) => c.bake()));
    return C3R.styleHTML() + this.domElement.outerHTML;
  }

  #syncCamera(container: C3R.Container, camera: Camera): void {
    const c = container.camera;

    if (camera instanceof PerspectiveCamera) {
      const fov =
        2 *
        RAD2DEG *
        Math.atan(Math.tan(camera.fov / 2 / RAD2DEG) / camera.zoom);
      if (c instanceof C3R.PerspectiveCamera) {
        c.fov = fov;
      } else {
        c[Symbol.dispose](); // ours, never shared
        container.camera = new C3R.PerspectiveCamera(fov);
      }
    } else if (camera instanceof OrthographicCamera) {
      const { zoom } = camera;
      const left = camera.left / zoom;
      const right = camera.right / zoom;
      const top = camera.top / zoom;
      const bottom = camera.bottom / zoom;
      if (c instanceof C3R.OrthographicCamera) {
        Object.assign(c, { left, right, top, bottom });
      } else {
        c[Symbol.dispose]();
        container.camera = new C3R.OrthographicCamera(left, right, top, bottom);
      }
    }

    this.#setPose(container.camera, camera.matrixWorld.elements);
  }

  // The light's share of the brightness at the mesh's center, which a shadow takes
  #shadowOpacity(mesh: Mesh): number {
    const { ambient, level, position } = this.#shadowLight!;
    let light = level;
    if (position) {
      const { geometry } = mesh;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      _position
        .copy(geometry.boundingSphere!.center)
        .applyMatrix4(mesh.matrixWorld);
      light /= Math.max(
        _position.distanceToSquared(_direction.fromArray(position)),
        1e-12,
      );
    }
    return light / (ambient + light);
  }

  #syncObject(object: Object3D, node: C3R.Group, camera: Camera): void {
    const { style } = node.domElement;
    const display = object.visible ? "" : "none";
    if (style.display !== display) {
      style.display = display;
      this.#changed = true;
    }
    if (!object.visible) return;

    const isSprite = object instanceof Sprite || object instanceof CSS3DSprite;
    const matrix = isSprite
      ? this.#spriteMatrix(object, node, camera)
      : object.matrix.elements;

    // A sprite turns with the camera, which shadows don't follow
    if (this.#setPose(node, matrix) && !isSprite) this.#changed = true;

    this.#syncChildren(object, node, camera);

    if (isSprite && node instanceof C3R.ElementObject) {
      node.rotation =
        object instanceof Sprite
          ? object.material.rotation
          : ((object as RotatedSprite).rotation2D ?? 0);
    }

    if (object instanceof Sprite) this.#syncMaterial(object.material, node);
    if (object instanceof Mesh) this.#syncMesh(object, node);
  }

  // Most nodes hold still, a new Transform each frame is the slow part
  #setPose(target: C3R.Group | C3R.Camera, elements: number[]): boolean {
    const last = this.#poses.get(target);
    if (last?.every((v, i) => v === elements[i])) return false;
    target.transform = C3R.Transform.matrix(elements);
    this.#poses.set(target, [...elements]);
    return true;
  }

  #spriteMatrix(object: Object3D, node: C3R.Group, camera: Camera): number[] {
    // Billboard in world space
    _matrix.extractRotation(camera.matrixWorld);

    object.matrixWorld.decompose(_position, _quaternion, _scale);
    _matrix.setPosition(_position).scale(_scale);

    // relative to the parent node
    if (object.parent)
      _matrix.premultiply(_parent.copy(object.parent.matrixWorld).invert());

    if (node instanceof C3R.ElementObject) {
      const { x, y } =
        object instanceof Sprite ? object.center : DEFAULT_CENTER;
      node.center = [x, y];
    }

    return _matrix.elements;
  }

  #syncChildren(object: Object3D, node: C3R.Group, camera: Camera): void {
    const previous = this.#children.get(node) ?? new Map<Object3D, C3R.Group>();
    const current = new Map<Object3D, C3R.Group>();

    for (const child of object.children) {
      let childNode = previous.get(child);
      if (!childNode) {
        childNode = createNode(child);
        node.addChild(childNode);
        this.#changed = true;
      }
      current.set(child, childNode);
    }

    for (const [child, childNode] of previous) {
      if (current.has(child)) continue;
      node.removeChild(childNode);
      this.#changed = true;
    }

    this.#children.set(node, current);

    for (const [child, childNode] of current) {
      this.#syncObject(child, childNode, camera);
    }
  }

  #syncMesh(mesh: Mesh, node: C3R.Group): void {
    const { geometry } = mesh;
    const { index, attributes, drawRange } = geometry;
    const { position, uv } = attributes;
    if (!position) return;
    const normal = this.shading ? attributes.normal : undefined;

    const total = index ? index.count : position.count;

    const ranges: Range[] = (
      geometry.groups.length
        ? geometry.groups
        : [{ ...drawRange, materialIndex: 0 }]
    ).map((g) => ({
      start: g.start,
      count: Math.min(g.count, total - g.start),
      materialIndex: g.materialIndex ?? 0,
    }));

    const materials: MappedMaterial[] = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const maps = ranges.map(
      (r) => materials[r.materialIndex % materials.length].map,
    );
    const textures = maps.map(textureSize);
    // Exported uvs are off by a texel or two, which must not block merging
    const sides = textures.flatMap((size) => (size ? [...size] : []));
    const uvTolerance = sides.length ? 2 / Math.min(...sides) : undefined;

    const key: unknown[] = [
      uvTolerance,
      geometry,
      index,
      index?.version,
      position,
      version(position),
      uv,
      version(uv),
      normal,
      version(normal),
    ];
    ranges.forEach((r, i) => key.push(r.start, r.count, !maps[i]));

    let state = this.#meshes.get(node);
    if (!state || !sameKey(state.key, key)) {
      state?.groups.forEach((g) => node.removeChild(g.node));
      const builder = new C3R.MeshBuilder(
        ranges.map((r) => readTriangles(geometry, r, normal)),
        { uvTolerance },
      );
      const groups = ranges.map((_, i) => {
        const node = new C3R.Group();
        const options = maps[i] ? {} : { getDomSize: flatDomSize };
        return { node, polygons: node.addFaces(builder.faces(i), options) };
      });
      // The node keeps its caster until it's replaced
      state = { key, groups, caster: state?.caster ?? null };
      state.groups.forEach((g) => node.addChild(g.node));
      this.#meshes.set(node, state);
      this.#changed = true;
    }

    if (this.#shadowLight && mesh.castShadow && state.fitted === undefined)
      state.fitted = casterOf(geometry);
    const caster =
      this.#shadowLight &&
      mesh.castShadow &&
      state.fitted &&
      !(
        this.#shadowLight.position &&
        // The core can't cast from there, three.js lights the scene anyway
        C3R.holdsLight(state.fitted, node, this.#shadowLight.position)
      )
        ? state.fitted
        : null;
    if (state.caster !== caster) {
      node.shadowCaster = state.caster = caster;
      this.#changed = true;
    }

    const shadows =
      this.#shadowLight && mesh.receiveShadow
        ? { opacity: this.#shadowOpacity(mesh), blur: this.#shadowLight.blur }
        : null;
    if (
      state.receiver?.shadows?.opacity !== shadows?.opacity ||
      state.receiver?.shadows?.blur !== shadows?.blur
    ) {
      state.receiver ??= new C3R.Material();
      state.receiver.shadows = shadows;
      const material = shadows && state.receiver;
      for (const { polygons } of state.groups)
        for (const polygon of polygons) polygon.material = material;
      this.#changed = true;
    }

    ranges.forEach((r, i) => {
      const group = state.groups[i];
      const material = materials[r.materialIndex % materials.length];
      const map = this.#syncMaterial(material, group.node);

      const repeat: [number, number] = map
        ? [map.repeat.x, map.repeat.y]
        : [1, 1];
      const offset: [number, number] = map
        ? [map.offset.x, map.offset.y]
        : [0, 0];
      for (const polygon of group.polygons) {
        polygon.uvScale = repeat;
        polygon.uvOffset = offset;
        polygon.textureSize = textures[i];
        polygon.pixelRatio = devicePixelRatio;
        polygon.overlapFolds = !material.transparent;
        polygon.clampUV =
          map?.wrapS === ClampToEdgeWrapping &&
          map.wrapT === ClampToEdgeWrapping;
      }
    });
  }

  // Returns the map in use, for the caller to apply its repeat/offset
  #syncMaterial(
    material: MappedMaterial,
    node: C3R.Group,
  ): Texture | null | undefined {
    let state = this.#materials.get(material);
    if (!state) {
      const created = {
        material: new C3R.Material(),
        map: undefined,
        version: -1,
        canvasSrc: "",
      };
      // Not this.#materials, the listener would keep the renderer alive
      const materials = this.#materials;
      const onDispose = () => {
        material.removeEventListener("dispose", onDispose);
        created.material[Symbol.dispose]();
        materials.delete(material);
      };
      material.addEventListener("dispose", onDispose);
      this.#materials.set(material, (state = created));
    }

    const target = state.material;
    node.material = target;
    target.shading = this.shading ? shadingOf(material) : null;
    target.specular =
      this.shading && this.specular ? specularOf(material) : null;

    const { map } = material;
    const image: unknown = map?.image;
    let src: string | null = null;
    if (image instanceof HTMLImageElement) {
      // As written, a server-side DOM resolves it against its own origin
      src = image.getAttribute("src") ?? image.src;
    } else if (image instanceof HTMLCanvasElement && map) {
      if (state.map !== map || state.version !== map.version) {
        state.canvasSrc = image.toDataURL();
        state.map = map;
        state.version = map.version;
      }
      src = state.canvasSrc;
    }

    // A map without a url, like a bitmap or one still loading, shows the color
    let tint = 0xffffff;
    if (src) {
      target.background = src;
      // getHex clamps, a tint takes no color beyond white
      tint = material.color?.getHex() ?? tint;
    } else if (material.color) {
      material.color.getRGB(_rgb, SRGBColorSpace);
      target.background = [_rgb.r, _rgb.g, _rgb.b, 1];
    } else {
      target.background = null;
    }

    // Unclamped in three.js
    const opacity =
      material.transparent && material.opacity < 1
        ? Math.max(0, material.opacity)
        : 1;
    const [r, g, b] = [tint >> 16, (tint >> 8) & 255, tint & 255];
    target.filter = [
      tint === 0xffffff ? null : C3R.Filter.tint([r / 255, g / 255, b / 255]),
      opacity < 1 ? C3R.Filter.opacity(opacity) : null,
    ].filter((f) => f !== null);
    target.doubleSided = material.side !== FrontSide;

    return map;
  }
}

const version = (
  attribute?: BufferAttribute | InterleavedBufferAttribute | null,
) =>
  attribute instanceof InterleavedBufferAttribute
    ? attribute.data.version
    : attribute?.version;

const textureSize = (map?: Texture | null): [number, number] | null => {
  const image = map?.image as
    | {
        naturalWidth?: number;
        naturalHeight?: number;
        width?: number;
        height?: number;
      }
    | undefined;
  const width = image?.naturalWidth || image?.width;
  const height = image?.naturalHeight || image?.height;
  if (width && height) return [width, height];
  return image instanceof HTMLImageElement && image.src
    ? probeSize(image.src)
    : null;
};

const probes = new Map<string, HTMLImageElement>();

// Sized like the CSS background, which loads without crossOrigin
const probeSize = (src: string): [number, number] | null => {
  let probe = probes.get(src);
  if (!probe) {
    probes.set(src, (probe = new Image()));
    probe.src = src;
  }
  return probe.naturalWidth ? [probe.naturalWidth, probe.naturalHeight] : null;
};

const sameKey = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function createNode(object: Object3D): C3R.Group {
  if (object instanceof CSS3DObject) {
    return new C3R.ElementObject(object.element);
  }

  if (object instanceof Sprite) {
    // Painted like a polygon, so its map takes the color's tint
    const element = document.createElement("div");
    element.style.backgroundImage =
      "var(--c3r-tween-layers,) var(--c3r-layers,) var(--c3r-background-image, none)";
    element.style.backgroundBlendMode = "multiply";
    element.style.mask =
      "var(--c3r-tween-layered, var(--c3r-layered)) var(--c3r-alpha-mask, none) 0 0 / 100% 100%";
    const node = new C3R.ElementObject(element);
    node.setSize(128, 128);
    node.scale = [1 / 128, 1 / 128];
    return node;
  }

  return new C3R.Group();
}

function readTriangles(
  geometry: BufferGeometry,
  { start, count }: Range,
  normal?: BufferAttribute | InterleavedBufferAttribute,
): C3R.Vertex[][] {
  const { index } = geometry;
  const { position, uv } = geometry.attributes;

  const vertex = (i: number): C3R.Vertex => {
    if (index) i = index.getX(i);
    return {
      position: [position.getX(i), position.getY(i), position.getZ(i)],
      uv: uv ? [uv.getX(i), uv.getY(i)] : [0, 0],
      ...(normal && {
        normal: [normal.getX(i), normal.getY(i), normal.getZ(i)],
      }),
    };
  };

  const triangles: C3R.Vertex[][] = [];
  for (let i = start; i + 2 < start + count; i += 3) {
    triangles.push([vertex(i), vertex(i + 1), vertex(i + 2)]);
  }

  return triangles;
}
