import { mat3, mat4, vec2, vec3, type ReadonlyVec2 } from "gl-matrix";

import { Object3D } from "./Object3D.js";
import {
  bounds,
  convexHull,
  cross2,
  minRect,
  simplify,
  toPlane,
  type EdgeNeighbour,
  type NeighbourSide,
} from "../math/planar.js";
import { Triangle } from "../math/Triangle.js";
import type { Vertex } from "../math/Vertex.js";

// Newell's method
const newellNormal = (vertices: readonly Vertex[]): vec3 => {
  const n = vec3.create();
  vertices.forEach(({ position: [x1, y1, z1] }, i) => {
    const [x2, y2, z2] = vertices[(i + 1) % vertices.length].position;
    vec3.add(n, n, [
      (y1 - y2) * (z1 + z2),
      (z1 - z2) * (x1 + x2),
      (x1 - x2) * (y1 + y2),
    ]);
  });
  return vec3.normalize(n, n);
};

const MITER_LIMIT = 4;

interface Edge {
  offset: number;
  sides: [ReadonlyVec2 | null, ReadonlyVec2 | null];
}

// Ends the overlap on the neighbour's side instead of past it
const cap = (
  p: ReadonlyVec2,
  n: ReadonlyVec2,
  d: number,
  side: ReadonlyVec2 | null,
): vec2 => {
  if (side) {
    const u = vec2.normalize(vec2.create(), vec2.sub(vec2.create(), side, p));
    const k = vec2.dot(u, n);
    if (k > 1e-6)
      return vec2.scaleAndAdd(u, p, u, Math.min(d / k, MITER_LIMIT * d));
  }
  return vec2.scaleAndAdd(vec2.create(), p, n, d);
};

const dilate = (points: ReadonlyVec2[], edges: Edge[]): vec2[] => {
  const n = points.length;
  const area = points.reduce(
    (s, p, i) => s + cross2(p, points[(i + 1) % n], [0, 0]),
    0,
  );
  const sign = Math.sign(area);

  const normal = (a: ReadonlyVec2, b: ReadonlyVec2) => {
    const e = vec2.normalize(vec2.create(), vec2.sub(vec2.create(), b, a));
    return vec2.fromValues(e[1] * sign, -e[0] * sign);
  };

  return points.flatMap((p, i) => {
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    const n1 = normal(points[prev], p);
    const n2 = normal(p, points[next]);
    const d1 = edges[prev].offset;
    const d2 = edges[i].offset;
    if (!d1 && !d2) return [vec2.clone(p)];

    // A miter at a convex corner pokes out of the mesh where the corner is on its border
    if (cross2(p, points[next], points[prev]) * sign > 0) {
      const c1 = d1 ? cap(p, n1, d1, edges[prev].sides[1]) : vec2.clone(p);
      const c2 = d2 ? cap(p, n2, d2, edges[i].sides[0]) : vec2.clone(p);
      if (vec2.equals(c1, c2)) return [c1];
      // Around a vertex of many faces the caps would cut off the corner
      const cut = cross2(c2, p, c1) * sign < 0;
      return cut ? [c1, vec2.clone(p), c2] : [c1, c2];
    }

    const c = vec2.dot(n1, n2);
    const det = Math.max(1 - c * c, 1e-6);
    const m = vec2.scale(vec2.create(), n1, (d1 - d2 * c) / det);
    vec2.scaleAndAdd(m, m, n2, (d2 - d1 * c) / det);

    const limit = MITER_LIMIT * Math.max(d1, d2);
    const len = vec2.len(m);
    if (len > limit) vec2.scale(m, m, limit / len);

    return [vec2.add(m, m, p)];
  });
};

export const defaultDomSize = (size: number) =>
  Math.max(250, Math.min(size, 1200));

export interface PolygonOptions {
  contentElement?: HTMLElement;
  // Base size of the dom element, too small makes the content blurry
  getDomSize?: (size: number) => number;
  // Outward edge offset in DOM pixels, hides seams between neighbours
  edgeOverlap?: number;
  // Over a convex fold the overlap sticks out as a lip
  convexOverlap?: number;
  // Per edge from each vertex, edges without a neighbour would only overhang
  edges?: readonly EdgeNeighbour[];
}

export class Polygon extends Object3D {
  readonly vertices: readonly Vertex[]; // vertices in CCW
  readonly contentElement: HTMLElement;
  // Clips in a child, Chrome masks the 3d layer itself with an oversized layer (flicker)
  #clipElement = document.createElement("div");

  #uvScale: ReadonlyVec2 = [1, 1];
  #uvOffset: ReadonlyVec2 = [0, 0];

  #getDomSize: (size: number) => number;
  #edgeOverlap: number;
  #convexOverlap: number;
  #edges: readonly EdgeNeighbour[];
  #overlapFolds = true;
  #clampUV = false;

  #clipPath: ReadonlyVec2[] = []; // path of the dilated polygon on a rectangular element
  #vertexPoints: ReadonlyVec2[] = [];

  #blockWidth = 0;
  #blockHeight = 0;

  constructor(
    vertices: readonly Vertex[],
    {
      contentElement = document.createElement("div"),
      getDomSize = defaultDomSize,
      edgeOverlap = 1,
      convexOverlap = 0.4,
      edges,
    }: PolygonOptions = {},
  ) {
    super();

    this.vertices = simplify(vertices);
    this.#edges = edges ?? this.vertices.map(() => [null, null]);
    this.#getDomSize = getDomSize;
    this.#edgeOverlap = edgeOverlap;
    this.#convexOverlap = convexOverlap;

    this.domElement.classList.add("c3r-polygon");

    this.contentElement = contentElement;
    this.contentElement.classList.add("c3r-polygon-content");
    this.#clipElement.classList.add("c3r-polygon-clip");
    this.#clipElement.appendChild(this.contentElement);
    this.domElement.appendChild(this.#clipElement);

    this.#fit();
    this.#updateContent();
  }

  // Overlapping a fold leaves a lip, which shows through a transparent surface
  get overlapFolds(): boolean {
    return this.#overlapFolds;
  }

  set overlapFolds(overlap: boolean) {
    if (overlap === this.#overlapFolds) return;
    this.#overlapFolds = overlap;
    this.#fit();
    this.#updateContent();
  }

  get clampUV(): boolean {
    return this.#clampUV;
  }

  set clampUV(clamp: boolean) {
    if (clamp === this.#clampUV) return;
    this.#clampUV = clamp;
    this.#updateContent();
  }

  get uvScale(): ReadonlyVec2 {
    return this.#uvScale;
  }

  set uvScale(scale: ReadonlyVec2) {
    if (vec2.exactEquals(scale, this.#uvScale)) return;
    this.#uvScale = vec2.clone(scale);
    this.#updateContent();
  }

  get uvOffset(): ReadonlyVec2 {
    return this.#uvOffset;
  }

  set uvOffset(offset: ReadonlyVec2) {
    if (vec2.exactEquals(offset, this.#uvOffset)) return;
    this.#uvOffset = vec2.clone(offset);
    this.#updateContent();
  }

  #fit(): void {
    const [v0, v1, v2] = this.vertices;
    if (!v2) throw new Error("The polygon has not enough sides");

    // The first corner may be reflex
    const norm =
      this.vertices.length === 3 ? undefined : newellNormal(this.vertices);
    const tri = new Triangle(v0.position, v1.position, v2.position, norm);

    if (this.vertices.length === 3) {
      this.#fitTriangle(tri);
    } else {
      this.#fitPolygon(tri);
    }

    const clip = this.#clipPath
      .map((p) => `${p[0] * 100}% ${p[1] * 100}%`)
      .join();
    this.#clipElement.style.clipPath = `polygon(${clip})`;

    // We need the width/height information in the childNode to properly position and scale the texture
    // If we use width/height CSS values, then we can rescale this element, without calling updateContent

    this.domElement.style.setProperty("--c3r-width", `${this.#blockWidth}px`);
    this.domElement.style.setProperty("--c3r-height", `${this.#blockHeight}px`);
  }

  // Faster method for triangles: the longest side will be the base
  #fitTriangle(tri: Triangle): void {
    const ln = tri.calculateEdgeLengths();

    const ai = ln.indexOf(Math.max(...ln));
    const bi = (ai + 1) % 3;
    const ci = (ai + 2) % 3;

    const a = ln[ai];
    const b = ln[bi];
    const c = ln[ci];

    const Ax = -(b * b - c * c - a * a) / (2 * a);
    const Ay = Math.sqrt(Math.max(0, c * c - Ax * Ax));

    const scale = this.#getDomSize(a) / a;

    const points: vec2[] = [];
    points[ai] = vec2.fromValues(0, 0);
    points[bi] = vec2.fromValues(a * scale, 0);
    points[ci] = vec2.fromValues(Ax * scale, Ay * scale);

    this.#layout(points, tri);
  }

  #fitPolygon(tri: Triangle): void {
    const plane = toPlane(tri.norm);
    const points2d = this.vertices.map((v) => plane(v.position));
    const { bounds: minBounds, TI: minTI } = minRect(convexHull(points2d));

    const [xmin, xmax, ymin, ymax] = minBounds;
    const boxWidth = xmax - xmin;
    const boxHeight = ymax - ymin;

    const longest = Math.max(boxWidth, boxHeight);
    const scale = this.#getDomSize(longest) / longest;

    const points = points2d.map((p) => {
      const t = vec2.transformMat2(vec2.create(), p, minTI);
      return vec2.fromValues((t[0] - xmin) * scale, (t[1] - ymin) * scale);
    });

    this.#layout(points, tri);
  }

  // Fits the element around the dilated polygon
  #layout(points: ReadonlyVec2[], tri: Triangle): void {
    const [c0, c1, c2] = points.map(([x, y]) => vec3.fromValues(x, y, 0));
    const toMesh = new Triangle(c0, c1, c2, [0, 0, 1]).getTransformationTo(tri);
    const fromMesh = mat4.invert(mat4.create(), toMesh);
    // A folded side projects close to the edge, the plain offset fits it better
    const project = (side: NeighbourSide | null) => {
      if (side?.fold !== "smooth" || !fromMesh) return null;
      const [x, y] = vec3.transformMat4(vec3.create(), side.point, fromMesh);
      return vec2.fromValues(x, y);
    };

    const edges = this.#edges.map((sides): Edge => {
      const offsets = sides.map((side) => {
        if (side?.fold === "smooth") return this.#edgeOverlap;
        if (!side || !this.#overlapFolds) return 0;
        return side.fold === "concave"
          ? this.#edgeOverlap
          : this.#convexOverlap;
      });
      return {
        offset: Math.max(...offsets),
        sides: [project(sides[0]), project(sides[1])],
      };
    });
    const dilated = dilate(points, edges);

    const [xmin, xmax, ymin, ymax] = bounds(dilated);
    this.#blockWidth = xmax - xmin;
    this.#blockHeight = ymax - ymin;

    const fit = ([x, y]: ReadonlyVec2) =>
      vec2.fromValues(
        (x - xmin) / this.#blockWidth,
        (y - ymin) / this.#blockHeight,
      );

    this.#clipPath = dilated.map(fit);
    this.#vertexPoints = points.map(fit);

    this.setMatrix(mat4.translate(toMesh, toMesh, [xmin, ymin, 0]));
  }

  #updateContent(): void {
    const uvs = this.vertices.map((v) => {
      const uv = vec2.mul(vec2.create(), v.uv, this.#uvScale);
      return vec2.add(uv, uv, this.#uvOffset);
    });

    const { style } = this.contentElement;

    // No texture mapping without a UV area (e.g. a mesh without uvs), show the plain color
    if (!cross2(uvs[1], uvs[2], uvs[0])) {
      style.removeProperty("background-position");
      style.removeProperty("background-size");
      style.removeProperty("mask-position");
      style.removeProperty("mask-size");
      style.removeProperty("transform");
      return;
    }

    type Point = [number, number, number];
    const point = ([x, y]: ReadonlyVec2): Point => [x, y, 1];

    const [p0, p1, p2] = this.#vertexPoints;
    const TB = mat3.fromValues(...point(p0), ...point(p1), ...point(p2));

    // Extend the UV area to cover the dilated clip path
    const TBI = mat3.invert(mat3.create(), TB);
    if (!TBI) throw new Error("Degenerate polygon");

    const UV = mat3.fromValues(
      ...point(uvs[0]),
      ...point(uvs[1]),
      ...point(uvs[2]),
    );
    const toUV = mat3.mul(TBI, UV, TBI);
    const clipUVs = this.#clipPath.map((p) =>
      vec2.transformMat3(vec2.create(), p, toUV),
    );

    // CSS has no clamped background, squeeze the mapping onto the texture instead
    if (this.#clampUV) {
      for (const k of [0, 1]) {
        const values = uvs.map((uv) => uv[k]);
        const lo = Math.min(0, ...values);
        const hi = Math.max(1, ...values);
        const c = (Math.min(...values) + Math.max(...values)) / 2;
        let s = 1;
        for (const uv of clipUVs) {
          if (uv[k] < lo) s = Math.min(s, (c - lo) / (c - uv[k]));
          if (uv[k] > hi) s = Math.min(s, (hi - c) / (uv[k] - c));
        }
        for (const uv of [...uvs, ...clipUVs]) uv[k] = c + s * (uv[k] - c);
      }
    }

    const [txmin, txmax, tymin, tymax] = bounds([...uvs, ...clipUVs]);

    const xsize = txmax - txmin;
    const ysize = tymax - tymin;

    const scx = 1 / xsize;
    const scy = 1 / ysize;

    const position = `calc(var(--c3r-width) * ${-txmin * scx}) calc(var(--c3r-height) * ${1 + tymin * scy})`;
    const size = `${100 * scx}% ${100 * scy}%`;
    style.backgroundPosition = style.maskPosition = position;
    style.backgroundSize = style.maskSize = size;

    const uvPoint = ([u, v]: vec2): Point => [
      (u - txmin) * scx,
      1 - (v - tymin) * scy,
      1,
    ];
    const TA = mat3.fromValues(
      ...uvPoint(uvs[0]),
      ...uvPoint(uvs[1]),
      ...uvPoint(uvs[2]),
    );

    const TAI = mat3.invert(TA, TA);
    if (!TAI) throw new Error("Degenerate polygon");

    const TX = mat3.mul(TAI, TB, TAI);

    const bh = this.#blockHeight / this.#blockWidth;
    style.transform =
      `translate(${TX[6] * 100}%,${TX[7] * 100}%)` +
      `matrix(${[TX[0], TX[1] * bh, TX[3] / bh, TX[4], 0, 0].join()})`;
  }
}
