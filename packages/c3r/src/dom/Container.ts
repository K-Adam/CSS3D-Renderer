import type { Camera } from "../css/Camera.js";
import { PerspectiveCamera } from "../css/PerspectiveCamera.js";

import { Group } from "./Group.js";

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
