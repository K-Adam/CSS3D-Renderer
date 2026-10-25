import { Camera } from "./Camera.js";

export class OrthographicCamera extends Camera {
  readonly projectionClass = "c3r-orthographic";
  #left = 0;
  #right = 0;
  #top = 0;
  #bottom = 0;

  constructor(left: number, right: number, top: number, bottom: number) {
    super();
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
  }

  get left(): number {
    return this.#left;
  }

  set left(left: number) {
    this.#left = left;
    this.setParam("--c3r-camera-left", String(left));
  }

  get right(): number {
    return this.#right;
  }

  set right(right: number) {
    this.#right = right;
    this.setParam("--c3r-camera-right", String(right));
  }

  get top(): number {
    return this.#top;
  }

  set top(top: number) {
    this.#top = top;
    this.setParam("--c3r-camera-top", String(top));
  }

  get bottom(): number {
    return this.#bottom;
  }

  set bottom(bottom: number) {
    this.#bottom = bottom;
    this.setParam("--c3r-camera-bottom", String(bottom));
  }
}
