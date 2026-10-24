import { vec2, vec3 } from "gl-matrix";

export class Vertex {
  position: vec3;
  uv: vec2;

  constructor(position: vec3 = vec3.create(), uv: vec2 = vec2.create()) {
    this.position = position;
    this.uv = uv;
  }
}
