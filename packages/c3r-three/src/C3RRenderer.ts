import {
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
}

const DEFAULT_CENTER = { x: 0.5, y: 0.5 };
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

    container.camera.matrix = camera.matrixWorldInverse.elements;
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
    _matrix.fromArray(container.camera.matrix).transpose();

    const e = _matrix.elements;
    e[3] = e[7] = e[11] = 0;
    e[15] = 1;

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

    return e;
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

    const key: unknown[] = [
      geometry,
      index,
      index?.version,
      position,
      version(position),
      uv,
      version(uv),
    ];
    for (const r of ranges) key.push(r.start, r.count);

    let state = this.#meshes.get(node);
    if (!state || !sameKey(state.key, key)) {
      state?.groups.forEach((g) => node.removeChild(g.node));
      state = { key, groups: ranges.map((r) => buildGroup(geometry, r)) };
      state.groups.forEach((g) => node.addChild(g.node));
      this.#meshes.set(node, state);
    }

    const materials: MappedMaterial[] = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    ranges.forEach((r, i) => {
      const group = state.groups[i];
      const map = this.#syncMaterial(
        materials[r.materialIndex % materials.length],
        group.node,
      );

      const repeat: [number, number] = map
        ? [map.repeat.x, map.repeat.y]
        : [1, 1];
      const offset: [number, number] = map
        ? [map.offset.x, map.offset.y]
        : [0, 0];
      for (const polygon of group.polygons) {
        polygon.uvScale = repeat;
        polygon.uvOffset = offset;
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
      src = image.src;
    } else if (image instanceof HTMLCanvasElement && map) {
      const cached = state.map === map && state.version === map.version;
      src = cached ? target.backgroundImageSrc : image.toDataURL();
      state.map = map;
      state.version = map.version;
    }
    target.backgroundImageSrc = src;

    if (material.color) {
      material.color.getRGB(_rgb, SRGBColorSpace);
      target.backgroundColor = [_rgb.r, _rgb.g, _rgb.b, 1];
    } else {
      target.backgroundColor = null;
    }

    target.opacity = material.transparent ? material.opacity : 1;
    // ponytail: BackSide renders as double-sided, CSS can't cull front faces only
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

const sameKey = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function createNode(object: Object3D): C3R.Group {
  if (object instanceof CSS3DObject) {
    const node = new C3R.ElementObject(object.element);
    node.domElement.style.backfaceVisibility = "visible";
    return node;
  }

  if (object instanceof Sprite) {
    const element = document.createElement("div");
    element.style.backgroundBlendMode = "multiply";
    element.style.maskImage = "var(--c3r-background-image, none)";
    element.style.maskSize = "100% 100%";

    const node = new C3R.ElementObject(element);
    node.setSize(128, 128);
    node.scale = [1 / 128, 1 / 128];
    return node;
  }

  return new C3R.Group();
}

function buildGroup(
  geometry: BufferGeometry,
  { start, count }: Range,
): MeshState["groups"][number] {
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

  const node = new C3R.Group();
  return { node, polygons: node.addTriangles(triangles) };
}
