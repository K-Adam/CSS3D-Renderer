import { mat4, type ReadonlyMat4 } from "gl-matrix";

import type { Camera } from "../css/Camera.js";
import { imageInfo, loadImage } from "../css/images.js";
import { PerspectiveCamera } from "../css/PerspectiveCamera.js";
import { cssText } from "../css/styles.js";

import { ElementObject } from "./ElementObject.js";
import { Group } from "./Group.js";
import type { Object3D } from "./Object3D.js";
import { measurePolygon, Polygon } from "./Polygon.js";

// Keeps a Camera, and its rules, alive while its element is
const elementCameras = new WeakMap<Element, Camera>();

export class Container {
  readonly domElement: HTMLDivElement = document.createElement("div");
  // Camera transform
  readonly viewElement: HTMLDivElement = document.createElement("div");

  #root: Group = new Group();
  #camera: Camera = new PerspectiveCamera();
  #width = 0;
  #height = 0;
  #unitScale = 1;
  #refit: Promise<void> | null = null;

  constructor() {
    this.domElement.classList.add(
      "c3r-container",
      this.#camera.projectionClass,
      this.#camera.className,
    );
    this.viewElement.classList.add("c3r-group", "c3r-view");
    elementCameras.set(this.domElement, this.#camera);

    this.domElement.appendChild(this.viewElement);
    this.viewElement.appendChild(this.#root.domElement);
    this.resetSize();
  }

  get root(): Group {
    return this.#root;
  }

  set root(root: Group) {
    if (root === this.#root) return;
    this.#root.domElement.replaceWith(root.domElement);
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
    ) => {
      if (node.domElement.style.display === "none") return;
      // Like the CSS variables: an image or a color replaces, null inherits
      const background = node.material?.background;
      if (background != null && !(node instanceof ElementObject))
        image = typeof background === "string" ? background : null;
      if (node instanceof Polygon) {
        const info = image === null ? null : imageInfo(image);
        // Keeps the old size while a new image loads
        if (info === undefined) loading.push(loadImage(image!));
        else measurePolygon(node, info?.size ?? null);
      }
      // Measuring refits the matrix
      const m = mat4.mul(mat4.create(), parent, node.matrix);
      if (node instanceof Polygon) {
        const scale = Math.min(
          Math.hypot(m[0], m[1], m[2]),
          Math.hypot(m[4], m[5], m[6]),
        );
        if (scale > 0) density = Math.max(density, 1 / scale);
      } else if (node instanceof Group) {
        for (const child of node.children) visit(child, m, image);
      }
    };
    visit(this.#root, this.#camera.viewMatrix, null);
    const exponent = Math.ceil(Math.log2(density || 1));
    this.unitScale = 2 ** Math.min(Math.max(exponent, -20), 20);
    return loading;
  }

  async toHTML(): Promise<string> {
    await this.bake();
    // So no value can close the style element
    const css = cssText().replaceAll("<", "\\3c ");
    return `<style>${css}</style>${this.domElement.outerHTML}`;
  }

  setSize(width: number, height: number): void {
    if (this.#width === width && this.#height === height) return;

    this.#width = width;
    this.#height = height;

    const { style } = this.domElement;
    style.setProperty("--c3r-viewport-width", `${width}px`);
    style.setProperty("--c3r-viewport-height", `${height}px`);
    // Unitless for the ortho scale, CSS can't divide lengths yet
    style.setProperty("--c3r-viewport-x", String(width));
    style.setProperty("--c3r-viewport-y", String(height));
  }

  resetSize(): void {
    this.#width = 0;
    this.#height = 0;

    const { style } = this.domElement;
    style.removeProperty("--c3r-viewport-width");
    style.removeProperty("--c3r-viewport-height");
    style.setProperty("--c3r-viewport-x", String(innerWidth));
    style.setProperty("--c3r-viewport-y", String(innerHeight));
  }
}
