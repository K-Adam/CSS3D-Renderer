import { Camera } from "./Camera.js";

export class OrthographicCamera extends Camera {
  readonly type = "c3r-orthographic";
  left: number;
  right: number;
  top: number;
  bottom: number;

  constructor(left: number, right: number, top: number, bottom: number) {
    super();
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
  }

  protected params(): Record<string, string> {
    return {
      "--camera-left": String(this.left),
      "--camera-right": String(this.right),
      "--camera-top": String(this.top),
      "--camera-bottom": String(this.bottom),
    };
  }
}
