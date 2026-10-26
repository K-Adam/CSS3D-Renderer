import type { ReadonlyVec2, ReadonlyVec3 } from "gl-matrix";

export interface Vertex {
  position: ReadonlyVec3;
  uv: ReadonlyVec2;
}
