import type { Camera } from "../css/Camera.js";
import { PerspectiveCamera } from "../css/PerspectiveCamera.js";

import { Group } from "./Group.js";

export class Container {
  readonly domElement: HTMLDivElement = document.createElement("div");
  // Camera transform
  readonly viewElement: HTMLDivElement = document.createElement("div");
  root: Group = new Group();

  width = 0;
  height = 0;

  #camera: Camera = new PerspectiveCamera();

  constructor() {
    this.domElement.classList.add(
      "c3r-container",
      this.#camera.type,
      this.#camera.className,
    );
    this.viewElement.classList.add("c3r-group", "c3r-view");

    this.domElement.appendChild(this.viewElement);
    this.viewElement.appendChild(this.root.domElement);
    this.resetSize();
    this.updateCamera();
  }

  get camera(): Camera {
    return this.#camera;
  }

  // Not disposed when replaced, cameras can be shared
  set camera(camera: Camera) {
    const { classList } = this.domElement;
    classList.remove(this.#camera.type, this.#camera.className);
    classList.add(camera.type, camera.className);

    this.#camera = camera;
    this.updateCamera();
  }

  // Call after mutating the camera
  updateCamera(): void {
    this.#camera.update();
  }

  addRoot(root: Group): void {
    this.root.domElement.replaceWith(root.domElement);
    this.root = root;
  }

  setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) {
      return;
    }

    this.width = width;
    this.height = height;

    const { style } = this.domElement;
    style.setProperty("--viewport-width", `${width}px`);
    style.setProperty("--viewport-height", `${height}px`);
    // Unitless for the ortho scale, CSS can't divide lengths yet
    style.setProperty("--viewport-w", String(width));
    style.setProperty("--viewport-h", String(height));
  }

  resetSize(): void {
    this.width = 0;
    this.height = 0;

    const { style } = this.domElement;
    style.removeProperty("--viewport-width");
    style.removeProperty("--viewport-height");
    // ponytail: window size at reset, ortho needs setSize for other sizes or resizes
    style.setProperty("--viewport-w", String(innerWidth));
    style.setProperty("--viewport-h", String(innerHeight));
  }
}
