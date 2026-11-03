import { mat4, type ReadonlyMat4, type ReadonlyVec3, vec3 } from "gl-matrix";

import { type Camera, viewMatrixOf } from "../css/Camera.js";
import { imageInfo, loadImage } from "../css/images.js";
import type { Shading, Specular } from "../css/Material.js";
import { PerspectiveCamera } from "../css/PerspectiveCamera.js";
import { styleHTML } from "../css/styles.js";
import { vector } from "../css/Transform.js";
import { setTweenClasses, setTweens, type Tween } from "../css/Tween.js";

import { ElementObject } from "./ElementObject.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D, parents } from "./Object3D.js";
import { measurePolygon, Polygon } from "./Polygon.js";
import { movedPosition, setShaded } from "./Shading.js";

export interface Lights {
  ambient?: { readonly intensity: number };
  // In world space, direction is the way the light travels
  directional?: {
    readonly direction: ReadonlyVec3;
    readonly intensity: number;
  };
  // In world space, instead of directional. Falls off with the squared distance
  point?: {
    readonly position: ReadonlyVec3;
    readonly intensity: number;
    // Moves it after position, like a group's. Each frame restyles the scene
    readonly tween?: Tween | readonly Tween[] | null;
  };
}

const intensityOf = (n: number): number => {
  if (!(n >= 0 && Number.isFinite(n)))
    throw new RangeError(`Invalid light intensity ${n}`);
  return n;
};

// Keeps a Camera, and its rules, alive while its element is
const elementCameras = new WeakMap<Element, Camera>();

export class Container {
  readonly domElement: HTMLDivElement = document.createElement("div");
  // Camera transform
  readonly viewElement: HTMLDivElement = document.createElement("div");

  #root: Group = new Group();
  #camera: Camera;
  #width = 0;
  #height = 0;
  #unitScale = 1;
  #refit: Promise<void> | null = null;
  #lights: Readonly<Lights> | null = null;

  // A camera given here spares a default whose rules would wait for GC
  constructor(camera: Camera = new PerspectiveCamera()) {
    this.#camera = camera;
    this.domElement.classList.add(
      "c3r-container",
      this.#camera.projectionClass,
      this.#camera.className,
    );
    this.viewElement.classList.add("c3r-group", "c3r-view");
    elementCameras.set(this.domElement, this.#camera);

    this.domElement.appendChild(this.viewElement);
    this.viewElement.appendChild(this.#root.domElement);
  }

  get root(): Group {
    return this.#root;
  }

  set root(root: Group) {
    if (root === this.#root) return;
    parents.get(root)?.removeChild(root);
    // The old root may have moved into another group
    this.viewElement.replaceChildren(root.domElement);
    this.#root = root;
  }

  get camera(): Camera {
    return this.#camera;
  }

  // Not disposed when replaced, cameras can be shared
  set camera(camera: Camera) {
    if (camera === this.#camera) return;
    const { classList } = this.domElement;
    classList.remove(this.#camera.projectionClass, this.#camera.className);
    classList.add(camera.projectionClass, camera.className);
    elementCameras.set(this.domElement, camera);
    this.#camera = camera;
  }

  get lights(): Readonly<Lights> | null {
    return this.#lights;
  }

  set lights(lights: Lights | null) {
    const { ambient, directional, point } = lights ?? {};
    if (directional && point)
      throw new RangeError("A container takes one directional or point light");
    const level = ambient ? intensityOf(ambient.intensity) : 0;
    const diffuse = directional ? intensityOf(directional.intensity) : 0;
    const intensity = point ? intensityOf(point.intensity) : 0;
    const position = point ? vector(point.position) : [0, 0, 0];
    const tweens = setTweens(undefined, point?.tween ?? null);
    const moved = movedPosition(position, tweens);
    const direction = directional && vector(directional.direction);
    const toLight = vec3.create();
    if (direction) {
      vec3.normalize(toLight, vec3.negate(toLight, direction));
      if (!vec3.length(toLight))
        throw new RangeError(`Invalid light direction ${direction}`);
    }
    this.#lights =
      lights &&
      Object.freeze({
        ...(ambient && { ambient: Object.freeze({ intensity: level }) }),
        ...(direction && {
          directional: Object.freeze({
            direction: Object.freeze(direction),
            intensity: diffuse,
          }),
        }),
        ...(point && {
          point: Object.freeze({
            position: Object.freeze(position),
            intensity,
            ...(point.tween && {
              tween: Array.isArray(point.tween) ? tweens : point.tween,
            }),
          }),
        }),
      });
    const [x, y, z] = toLight;
    const { style } = this.domElement;
    const previous = setTweenClasses(this.domElement, tweens);
    // It would clear an animation or transition set on the element itself
    if (tweens.length || previous.length) setTweens(style, tweens);
    const [px, py, pz] = moved.components;
    for (const [name, value] of Object.entries({
      ambient: level,
      // Smooth polygons paint by this, a point light's values carry its intensity
      diffuse: point ? 1 : diffuse,
      x,
      y,
      z,
      "point-x": px,
      "point-y": py,
      "point-z": pz,
      intensity,
    }))
      style.setProperty(`--c3r-light-${name}`, String(value));
  }

  get width(): number {
    return this.#width;
  }

  get height(): number {
    return this.#height;
  }

  // Chrome culls back faces only when polygons aren't tiny in view space
  get unitScale(): number {
    return this.#unitScale;
  }

  set unitScale(scale: number) {
    if (!(scale > 0 && Number.isFinite(scale)))
      throw new RangeError(`Invalid unit scale ${scale}`);
    if (scale === this.#unitScale) return;
    this.#unitScale = scale;
    this.domElement.style.setProperty("--c3r-unit-scale", String(scale));
  }

  bake(): Promise<void> {
    const loading = this.#fit();
    if (!loading.length) return Promise.resolve();
    // One refit at a time, c3r-three bakes every frame
    this.#refit ??= Promise.all(loading)
      .finally(() => (this.#refit = null))
      .then(() => this.bake());
    return this.#refit;
  }

  // Fits the unit scale: the densest polygon at one view pixel per DOM pixel, a
  // power of two scales exactly and holds still while objects move
  #fit(): Promise<unknown>[] {
    let density = 0;
    const loading: Promise<unknown>[] = [];
    const visit = (
      node: Object3D,
      parent: ReadonlyMat4,
      image: string | null,
      cells: readonly [number, number],
      shading: Shading | null,
      specular: Specular | null,
      diffuseMap: string | null,
    ) => {
      if (node.domElement.style.display === "none") return;
      // Like the CSS variables: an image or a color replaces, null inherits
      const material = node instanceof ElementObject ? null : node.material;
      const background = material?.background;
      if (background != null) {
        image = typeof background === "string" ? background : null;
        cells = [1, 1];
      }
      if (material?.flipbook)
        cells = [material.flipbook.columns, material.flipbook.rows];
      shading = material?.shading ?? shading;
      specular = material?.specular ?? specular;
      if (material?.diffuse) diffuseMap = material.diffuse.map || null;
      if (node instanceof Polygon) {
        setShaded(
          node,
          shading,
          specular,
          image !== null,
          !!this.#lights?.point,
          !!diffuseMap,
        );
        const info = image === null ? null : imageInfo(image);
        // Keeps the old size while a new image loads
        if (info === undefined) loading.push(loadImage(image!));
        else
          measurePolygon(
            node,
            info && [info.size[0] / cells[0], info.size[1] / cells[1]],
          );
      }
      // Measuring refits the matrix
      const m = mat4.mul(mat4.create(), parent, matrixOf(node));
      if (node instanceof Polygon) {
        const scale = Math.min(
          Math.hypot(m[0], m[1], m[2]),
          Math.hypot(m[4], m[5], m[6]),
        );
        if (scale > 0) density = Math.max(density, 1 / scale);
      } else if (node instanceof Group) {
        for (const child of node.children)
          visit(child, m, image, cells, shading, specular, diffuseMap);
      }
    };
    visit(
      this.#root,
      viewMatrixOf(this.#camera),
      null,
      [1, 1],
      null,
      null,
      null,
    );
    const exponent = Math.ceil(Math.log2(density || 1));
    this.unitScale = 2 ** Math.min(Math.max(exponent, -20), 20);
    return loading;
  }

  async toHTML(): Promise<string> {
    await this.bake();
    return styleHTML() + this.domElement.outerHTML;
  }

  setSize(width: number, height: number): void {
    if (this.#width === width && this.#height === height) return;

    this.#width = width;
    this.#height = height;

    const { style } = this.domElement;
    style.setProperty("--c3r-viewport-width", `${width}px`);
    style.setProperty("--c3r-viewport-height", `${height}px`);
  }

  resetSize(): void {
    this.#width = 0;
    this.#height = 0;

    const { style } = this.domElement;
    style.removeProperty("--c3r-viewport-width");
    style.removeProperty("--c3r-viewport-height");
  }
}
