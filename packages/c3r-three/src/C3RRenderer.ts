import {
  ClampToEdgeWrapping,
  FrontSide,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
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
const _quaternion = new Quaternion();
const _scale = new Vector3();
const _rgb = { r: 0, g: 0, b: 0 };
const RAD2DEG = 180 / Math.PI;

export class C3RRenderer {
  readonly domElement: HTMLDivElement = document.createElement("div");

  #width = 0;
  #height = 0;
  #containers = new Map<Scene, C3R.Container>(); // multiple scenes can overlap
  #children = new WeakMap<C3R.Group, Map<Object3D, C3R.Group>>();
  #meshes = new WeakMap<C3R.Group, MeshState>();
  #materials = new WeakMap<Material, MaterialState>();

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

    this.#syncCamera(container, camera);
    this.#syncObject(scene, container.root, container);
    void container.bake();
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

    container.camera.matrix = camera.matrixWorld.elements;
  }

  #syncObject(
    object: Object3D,
    node: C3R.Group,
    container: C3R.Container,
  ): void {
    const { style } = node.domElement;
    const display = object.visible ? "" : "none";
    if (style.display !== display) style.display = display;
    if (!object.visible) return;

    const isSprite = object instanceof Sprite || object instanceof CSS3DSprite;
    const matrix = isSprite
      ? this.#spriteMatrix(object, node, container)
      : object.matrix.elements;

    node.matrix = matrix;

    this.#syncChildren(object, node, container);

    if (isSprite && node instanceof C3R.ElementObject) {
      node.rotation =
        object instanceof Sprite
          ? object.material.rotation
          : ((object as RotatedSprite).rotation2D ?? 0);
    }

    if (object instanceof Sprite) this.#syncMaterial(object.material, node);
    if (object instanceof Mesh) this.#syncMesh(object, node);
  }

  #spriteMatrix(
    object: Object3D,
    node: C3R.Group,
    container: C3R.Container,
  ): number[] {
    // Billboard in world space
    _matrix.extractRotation(_matrix.fromArray(container.camera.matrix));

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

  #syncChildren(
    object: Object3D,
    node: C3R.Group,
    container: C3R.Container,
  ): void {
    const previous = this.#children.get(node) ?? new Map<Object3D, C3R.Group>();
    const current = new Map<Object3D, C3R.Group>();

    for (const child of object.children) {
      let childNode = previous.get(child);
      if (!childNode) {
        childNode = createNode(child);
        node.addChild(childNode);
      }
      current.set(child, childNode);
    }

    for (const [child, childNode] of previous) {
      if (!current.has(child)) node.removeChild(childNode);
    }

    this.#children.set(node, current);

    for (const [child, childNode] of current) {
      this.#syncObject(child, childNode, container);
    }
  }

  #syncMesh(mesh: Mesh, node: C3R.Group): void {
    const { geometry } = mesh;
    const { index, attributes, drawRange } = geometry;
    const { position, uv } = attributes;
    if (!position) return;

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
    ];
    ranges.forEach((r, i) => key.push(r.start, r.count, !maps[i]));

    let state = this.#meshes.get(node);
    if (!state || !sameKey(state.key, key)) {
      state?.groups.forEach((g) => node.removeChild(g.node));
      const builder = new C3R.MeshBuilder(
        ranges.map((r) => readTriangles(geometry, r)),
        { uvTolerance },
      );
      const groups = ranges.map((_, i) => {
        const node = new C3R.Group();
        const options = maps[i] ? {} : { getDomSize: flatDomSize };
        return { node, polygons: node.addFaces(builder.faces(i), options) };
      });
      state = { key, groups };
      state.groups.forEach((g) => node.addChild(g.node));
      this.#meshes.set(node, state);
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
    const node = new C3R.ElementObject(object.element);
    node.domElement.style.backfaceVisibility = "visible";
    return node;
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
): C3R.Vertex[][] {
  const { index } = geometry;
  const { position, uv } = geometry.attributes;

  const vertex = (i: number): C3R.Vertex => {
    if (index) i = index.getX(i);
    return {
      position: [position.getX(i), position.getY(i), position.getZ(i)],
      uv: uv ? [uv.getX(i), uv.getY(i)] : [0, 0],
    };
  };

  const triangles: C3R.Vertex[][] = [];
  for (let i = start; i + 2 < start + count; i += 3) {
    triangles.push([vertex(i), vertex(i + 1), vertex(i + 2)]);
  }

  return triangles;
}
