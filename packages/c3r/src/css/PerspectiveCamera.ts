import { Camera } from "./Camera.js";

export class PerspectiveCamera extends Camera {
  readonly type = "c3r-perspective";
  fov: number;

  constructor(fov = 70) {
    super();
    this.fov = fov;
  }

  protected params(): Record<string, string> {
    return { "--camera-fov": `${this.fov}deg` };
  }
}
