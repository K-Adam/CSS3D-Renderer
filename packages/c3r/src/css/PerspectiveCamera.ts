import { Camera } from "./Camera.js";

export class PerspectiveCamera extends Camera {
  readonly projectionClass = "c3r-perspective";
  #fov = 0;

  constructor(fov = 70) {
    super();
    this.fov = fov;
  }

  get fov(): number {
    return this.#fov;
  }

  set fov(fov: number) {
    this.#fov = fov;
    this.setParam("--c3r-camera-fov", `${fov}deg`);
  }
}
