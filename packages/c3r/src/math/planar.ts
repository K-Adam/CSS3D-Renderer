import {
  mat2,
  mat3,
  vec2,
  vec3,
  type ReadonlyVec2,
  type ReadonlyVec3,
} from "gl-matrix";

import type { Vertex } from "./Vertex.js";

export type Fold = "smooth" | "concave" | "convex";

export interface NeighbourSide {
  point: ReadonlyVec3;
  fold: Fold;
}

export type EdgeNeighbour = [NeighbourSide | null, NeighbourSide | null];

export const cross2 = (a: ReadonlyVec2, b: ReadonlyVec2, o: ReadonlyVec2) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

export const bounds = (points: ReadonlyVec2[]) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
};

export const convexHull = (points: ReadonlyVec2[]) => {
  const chain = (sorted: ReadonlyVec2[]) => {
    const out: ReadonlyVec2[] = [];
    for (const p of sorted) {
      while (out.length > 1 && cross2(out.at(-2)!, out.at(-1)!, p) <= 0)
        out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [...chain(sorted), ...chain(sorted.reverse())];
};

export const minRect = (hull: ReadonlyVec2[]) => {
  const boxes = hull.map((p, i) => {
    const [x, y] = vec2.normalize(
      vec2.create(),
      vec2.sub(vec2.create(), p, hull[(i + 1) % hull.length]),
    );
    // A reflection, so it is its own inverse
    const TI = mat2.fromValues(x, y, y, -x);
    const box = bounds(
      hull.map((q) => vec2.transformMat2(vec2.create(), q, TI)),
    );
    return { area: (box[1] - box[0]) * (box[3] - box[2]), bounds: box, TI };
  });
  return boxes.reduce((a, b) => (b.area < a.area ? b : a));
};

export const toPlane = (normal: ReadonlyVec3) => {
  const axis = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = vec3.cross(vec3.create(), normal, axis);
  vec3.normalize(u, u);
  const v = vec3.cross(vec3.create(), u, normal);
  return (p: ReadonlyVec3) => vec2.fromValues(vec3.dot(p, u), vec3.dot(p, v));
};

// Maps toPlane coordinates to uv, fitted to the first three corners
export const uvTransform = (
  corners: readonly Vertex[],
  normal: ReadonlyVec3,
): mat3 | null => {
  const plane = toPlane(normal);
  const columns = ([a, b, c]: ReadonlyVec2[]) =>
    mat3.fromValues(a[0], a[1], 1, b[0], b[1], 1, c[0], c[1], 1);
  const M = mat3.invert(
    mat3.create(),
    columns(corners.map((v) => plane(v.position))),
  );
  return M && mat3.mul(M, columns(corners.map((v) => v.uv)), M);
};

const direction = (a: ReadonlyVec3, b: ReadonlyVec3) => {
  const d = vec3.sub(vec3.create(), b, a);
  return vec3.normalize(d, d);
};

export const collinear = (a: ReadonlyVec3, b: ReadonlyVec3, c: ReadonlyVec3) =>
  vec3.equals(a, b) ||
  Math.abs(vec3.dot(direction(a, b), direction(b, c))) >= 0.9999;

export const simplify = (input: readonly Vertex[]): Vertex[] => {
  const vertices = [...input];
  for (let i = 0, kept = 0; kept < vertices.length && vertices.length > 3;) {
    const n = vertices.length;
    const [a, b, c] = [i + n - 1, i, i + 1].map(
      (k) => vertices[k % n].position,
    );
    if (collinear(a, b, c)) {
      vertices.splice(i, 1);
      i %= vertices.length;
      kept = 0;
    } else {
      i = (i + 1) % n;
      kept++;
    }
  }
  return vertices;
};
