import { mat2, mat3, vec2, vec3, type ReadonlyVec2 } from "gl-matrix";

import { Object3D } from "./Object3D.js";
import { Triangle } from "../math/Triangle.js";
import type { Vertex } from "../math/Vertex.js";

type Bounds = [xmin: number, xmax: number, ymin: number, ymax: number];

const cross2 = (a: ReadonlyVec2, b: ReadonlyVec2, o: ReadonlyVec2) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

const bounds = (points: ReadonlyVec2[]): Bounds =>
  points.reduce<Bounds>(
    ([xmin, xmax, ymin, ymax], [x, y]) => [
      Math.min(xmin, x),
      Math.max(xmax, x),
      Math.min(ymin, y),
      Math.max(ymax, y),
    ],
    [Infinity, -Infinity, Infinity, -Infinity],
  );

// Monotone chain, https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain
const convexHull = (points: ReadonlyVec2[]): ReadonlyVec2[] => {
  const sorted = points
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const chain = (pts: ReadonlyVec2[]) => {
    const out: ReadonlyVec2[] = [];
    for (const p of pts) {
      while (
        out.length >= 2 &&
        cross2(out[out.length - 2], out[out.length - 1], p) <= 0
      ) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };

  return [...chain(sorted), ...chain(sorted.slice().reverse())];
};

// Newell's method
const newellNormal = (vertices: Vertex[]): vec3 => {
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

// Offsets every edge outward by d
const dilate = (points: ReadonlyVec2[], d: number): vec2[] => {
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

  return points.map((p, i) => {
    const n1 = normal(points[(i + n - 1) % n], p);
    const n2 = normal(p, points[(i + 1) % n]);

    const m = vec2.add(vec2.create(), n1, n2);
    vec2.scale(m, m, d / Math.max(1 + vec2.dot(n1, n2), 1e-6));

    const len = vec2.len(m);
    if (len > MITER_LIMIT * d) vec2.scale(m, m, (MITER_LIMIT * d) / len);

    return vec2.add(m, m, p);
  });
};

export class Polygon extends Object3D {
  vertices: Vertex[]; // vertices in CCW
  readonly contentElement: HTMLElement;

  uvScale: vec2 = vec2.fromValues(1, 1);
  uvOffset: vec2 = vec2.fromValues(0, 0);

  // Base size of the dom element (for a triangle, the length of the longest side)
  // Avoid scaling issues. If the content element is initially too small, the result will be blurry
  getDomSize: (size: number) => number = (size) =>
    Math.max(250, Math.min(size, 1200));

  // Outward offset of the edges in DOM pixels, hides the anti-aliasing seams between neighbours
  edgeOverlap = 1;

  #clipPath: ReadonlyVec2[] = []; // path of the dilated polygon on a rectangular element
  #vertexPoints: ReadonlyVec2[] = [];

  #blockWidth = 0;
  #blockHeight = 0;

  constructor(vertices: Vertex[], contentElement: HTMLElement | null = null) {
    super();

    this.vertices = vertices;
    this.simplify();

    this.domElement.classList.add("c3r-polygon");

    this.contentElement = contentElement ?? document.createElement("div");
    this.contentElement.classList.add("c3r-polygon-content");
    this.domElement.appendChild(this.contentElement);
  }

  // Remove collinear vertices
  simplify(): void {
    const { vertices } = this;

    this.vertices = vertices.filter((vertex, i) => {
      if (i === 0) return true;

      const p1 = vertices[i - 1].position;
      const p3 = vertices[(i + 1) % vertices.length].position;

      const e1 = vec3.normalize(
        vec3.create(),
        vec3.sub(vec3.create(), p1, vertex.position),
      );
      const e2 = vec3.normalize(
        vec3.create(),
        vec3.sub(vec3.create(), vertex.position, p3),
      );

      return Math.abs(vec3.dot(e1, e2)) < 0.9999;
    });
  }

  override updateMatrix(): void {
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
    this.domElement.style.clipPath = `polygon(${clip})`;

    // We need the width/height information in the childNode to properly position and scale the texture
    // If we use width/height CSS values, then we can rescale this element, without calling updateContent

    this.domElement.style.setProperty("--width", `${this.#blockWidth}px`);
    this.domElement.style.setProperty("--height", `${this.#blockHeight}px`);

    super.updateMatrix();
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

    const scale = this.getDomSize(a) / a;

    const points: vec2[] = [];
    points[ai] = vec2.fromValues(0, 0);
    points[bi] = vec2.fromValues(a * scale, 0);
    points[ci] = vec2.fromValues(Ax * scale, Ay * scale);

    this.#layout(points, tri);
  }

  #fitPolygon(tri: Triangle): void {
    const b1 = tri.norm;
    const b2 =
      Math.abs(vec3.dot(b1, [0, 0, 1])) < 0.9
        ? vec3.cross(vec3.create(), b1, [0, 0, 1])
        : vec3.cross(vec3.create(), b1, [0, 1, 0]);
    const b3 = vec3.cross(vec3.create(), b2, b1);

    // Project the points to the polygon's plane
    // prettier-ignore
    const BT = mat3.fromValues(
            b2[0], b2[1], b2[2],
            b3[0], b3[1], b3[2],
            b1[0], b1[1], b1[2],
        );
    const BTI = mat3.invert(BT, BT);
    if (!BTI) throw new Error("Degenerate polygon");

    const points2d = this.vertices.map((v) => {
      const p = vec3.transformMat3(vec3.create(), v.position, BTI);
      return vec2.fromValues(p[0], p[1]);
    });

    const hull = convexHull(points2d);

    // For each edge of the hull, transform the points to make it axis aligned
    // and keep the AABB with the smallest area

    let minArea = Infinity;
    let minBounds: Bounds = [0, 0, 0, 0];
    let minTI = mat2.create();

    hull.forEach((point, i) => {
      const side = vec2.sub(vec2.create(), point, hull[(i + 1) % hull.length]);
      vec2.normalize(side, side);

      const ATI = mat2.invert(mat2.create(), [
        side[0],
        side[1],
        side[1],
        -side[0],
      ]);
      if (!ATI) return;

      const box = bounds(
        hull.map((p) => vec2.transformMat2(vec2.create(), p, ATI)),
      );

      const area = (box[1] - box[0]) * (box[3] - box[2]);
      if (area < minArea) {
        minArea = area;
        minBounds = box;
        minTI = ATI;
      }
    });

    const [xmin, xmax, ymin, ymax] = minBounds;
    const boxWidth = xmax - xmin;
    const boxHeight = ymax - ymin;

    const longest = Math.max(boxWidth, boxHeight);
    const scale = this.getDomSize(longest) / longest;

    const points = points2d.map((p) => {
      const t = vec2.transformMat2(vec2.create(), p, minTI);
      return vec2.fromValues((t[0] - xmin) * scale, (t[1] - ymin) * scale);
    });

    this.#layout(points, tri);
  }

  // Fits the element around the dilated polygon
  #layout(points: ReadonlyVec2[], tri: Triangle): void {
    const dilated = dilate(points, this.edgeOverlap);

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

    const [c0, c1, c2] = points.map(([x, y]) =>
      vec3.fromValues(x - xmin, y - ymin, 0),
    );
    this.matrix = new Triangle(c0, c1, c2, [0, 0, 1]).getTransformationTo(tri);
  }

  updateContent(): void {
    const uvs = this.vertices.map((v) => {
      const uv = vec2.mul(vec2.create(), v.uv, this.uvScale);
      return vec2.add(uv, uv, this.uvOffset);
    });

    const { style } = this.contentElement;

    // No texture mapping without a UV area (e.g. a mesh without uvs), show the plain color
    if (!cross2(uvs[1], uvs[2], uvs[0])) {
      style.removeProperty("background-position");
      style.removeProperty("background-size");
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

    const [txmin, txmax, tymin, tymax] = bounds([...uvs, ...clipUVs]);

    const xsize = txmax - txmin;
    const ysize = tymax - tymin;

    const scx = 1 / xsize;
    const scy = 1 / ysize;

    style.backgroundPosition = `calc(var(--width) * ${-txmin * scx}) calc(var(--height) * ${1 + tymin * scy})`;
    style.backgroundSize = `${100 * scx}% ${100 * scy}%`;

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
