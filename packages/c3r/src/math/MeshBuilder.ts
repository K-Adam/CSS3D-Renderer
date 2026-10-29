import { vec2, vec3 } from "gl-matrix";
import type { ReadonlyVec3 } from "gl-matrix";

import {
  collinear,
  convexHull,
  minRect,
  toPlane,
  uvTransform,
} from "./planar.js";
import type { EdgeNeighbour, NeighbourSide } from "./planar.js";
import { Triangle } from "./Triangle.js";
import type { Vertex } from "./Vertex.js";

export type TriangleList = readonly (readonly Vertex[])[];

export interface MeshFace {
  vertices: Vertex[];
  edges: EdgeNeighbour[];
}

// cos 45°
const SMOOTH_FOLD = 0.7;

// Weld distance as a share of the mesh size, models round their coordinates
const WELD = 1e-3;

// For a mesh with no extent
const MIN_WELD = 1e-9;

const SLIVER = 1e-6;

const COPLANAR = 1 - 1e-6;

const UV_TOLERANCE = 1e-3;

// A separate polygon costs a layer and a seam, worth some rasterized area
const MERGE_SLACK = 1.25;

interface Tri {
  corners: readonly Vertex[];
  ids: number[];
  triangle: Triangle;
  group: number;
  face?: Face;
}

interface Face {
  seed: Tri;
  tris: Tri[];
  ids: number[];
}

const key = (a: number, b: number) => `${a},${b}`;
const at = <T>(loop: T[], i: number) => loop[(i + loop.length) % loop.length];
const edgesOf = (ids: number[]) => ids.map((a, i) => [a, at(ids, i + 1)]);

const uvMap = ({ corners, triangle }: Tri) => {
  const plane = toPlane(triangle.norm);
  const M = uvTransform(corners, triangle.norm)!;
  return (p: ReadonlyVec3) => vec2.transformMat3(vec2.create(), plane(p), M);
};

// Shared edges run both ways and cancel out, null on a hole or pinch
const union = (face: number[], tri: number[]) => {
  const edges = [...edgesOf(face), ...edgesOf(tri)];
  const all = new Set(edges.map(([a, b]) => key(a, b)));
  const out = new Map<number, number>();
  for (const [a, b] of edges) {
    if (all.has(key(b, a))) continue;
    if (out.has(a)) return null;
    out.set(a, b);
  }
  const [start] = out.keys();
  const loop = [start];
  for (let v = out.get(start)!; v !== start; v = out.get(v)!) loop.push(v);
  return loop.length === out.size ? loop : null;
};

export class MeshBuilder {
  #eps = 0;
  #positions: ReadonlyVec3[] = [];
  #faces: Face[] = [];
  #borders = new Map<string, { face: Face; i: number }>();

  constructor(
    groups: readonly TriangleList[],
    { uvTolerance = UV_TOLERANCE } = {},
  ) {
    const tris = this.#weld(groups);
    const ownersOf = () =>
      new Map(
        tris.flatMap((t) => edgesOf(t.ids).map(([a, b]) => [key(a, b), t])),
      );
    this.#splitTJunctions(tris, ownersOf());
    const owners = ownersOf();

    tris.sort(
      (a, b) => b.triangle.calculateArea() - a.triangle.calculateArea(),
    );
    for (const seed of tris)
      if (!seed.face) this.#merge(seed, owners, uvTolerance);

    for (const face of this.#faces)
      face.ids.forEach((a, i) =>
        this.#borders.set(key(a, at(face.ids, i + 1)), { face, i }),
      );
  }

  faces(group: number): MeshFace[] {
    return this.#faces
      .filter((face) => face.seed.group === group)
      .map((face) => this.#output(face));
  }

  #weld(groups: readonly TriangleList[]): Tri[] {
    const points = groups.flat(2).map((v) => v.position);
    const span = [0, 1, 2].map((k) => {
      const values = points.map((p) => p[k]);
      return Math.max(...values) - Math.min(...values);
    });
    this.#eps = WELD * Math.hypot(...span) || MIN_WELD;

    const weld = (p: ReadonlyVec3) => {
      const id = this.#positions.findIndex((q) => vec3.dist(p, q) <= this.#eps);
      return id >= 0 ? id : this.#positions.push(p) - 1;
    };

    return groups.flatMap((triangles, group) =>
      triangles.flatMap((corners) => {
        const [p, q, r] = corners.map((v) => v.position);
        const triangle = new Triangle(p, q, r);
        const ids = corners.map((v) => weld(v.position));
        const longest = Math.max(...triangle.calculateEdgeLengths());
        const sliver = triangle.calculateArea() <= SLIVER * longest ** 2;
        if (sliver || new Set(ids).size < 3) return [];
        return [{ corners, ids, triangle, group }];
      }),
    );
  }

  // Splits long edges at the vertices on them, to pair with shorter neighbours
  #splitTJunctions(tris: Tri[], owners: Map<string, Tri>): void {
    const all = [...this.#positions.keys()];
    for (const t of tris)
      t.ids = edgesOf(t.ids).flatMap(([a, b]) => {
        if (owners.has(key(b, a))) return [a];
        const [p, q] = [this.#positions[a], this.#positions[b]];
        const from = (id: number) => vec3.dist(p, this.#positions[id]);
        const to = (id: number) => vec3.dist(this.#positions[id], q);
        const detour = (id: number) => from(id) + to(id) - vec3.dist(p, q);
        const inner = all.filter(
          (id) =>
            from(id) > this.#eps &&
            to(id) > this.#eps &&
            detour(id) < this.#eps ** 2 / vec3.dist(p, q),
        );
        return [a, ...inner.sort((i, j) => from(i) - from(j))];
      });
  }

  #merge(seed: Tri, owners: Map<string, Tri>, uvTolerance: number): void {
    const plane = toPlane(seed.triangle.norm);
    const toUV = uvMap(seed);
    const rect = (ids: number[]) =>
      minRect(convexHull(ids.map((id) => plane(this.#positions[id])))).area;
    const fits = (t: Tri) =>
      t.group === seed.group &&
      vec3.dot(t.triangle.norm, seed.triangle.norm) > COPLANAR &&
      t.corners.every((v) => vec2.dist(toUV(v.position), v.uv) <= uvTolerance);

    const face: Face = { seed, tris: [seed], ids: seed.ids };
    this.#faces.push((seed.face = face));
    for (const t of face.tris)
      for (const [a, b] of edgesOf(t.ids)) {
        const neighbour = owners.get(key(b, a));
        if (!neighbour || neighbour.face || !fits(neighbour)) continue;
        const ids = union(face.ids, neighbour.ids);
        const cost = (rect(face.ids) + rect(neighbour.ids)) * MERGE_SLACK;
        if (!ids || rect(ids) > cost) continue;
        face.ids = ids;
        face.tris.push(neighbour);
        neighbour.face = face;
      }
  }

  #side(face: Face, a: number, b: number, end: 0 | 1): NeighbourSide | null {
    const hit = this.#borders.get(key(b, a));
    if (!hit) return null;
    const normal = face.seed.triangle.norm;
    const dot = vec3.dot(hit.face.seed.triangle.norm, normal);
    // The back of a double-sided sheet is no neighbour
    if (dot < -0.99) return null;
    const from = this.#positions[end ? b : a];
    const point =
      this.#positions[at(hit.face.ids, end ? hit.i - 1 : hit.i + 2)];
    const rise = vec3.dot(vec3.sub(vec3.create(), point, from), normal);
    const fold =
      dot >= SMOOTH_FOLD ? "smooth" : rise > this.#eps ? "concave" : "convex";
    return { point, fold };
  }

  #output(face: Face): MeshFace {
    const { ids } = face;
    const toUV = uvMap(face.seed);
    const point = (i: number) => this.#positions[at(ids, i)];
    // T-junctions leave straight vertices on the border
    const corners = ids.flatMap((_, i) =>
      collinear(point(i - 1), point(i), point(i + 1)) ? [] : [i],
    );

    return {
      vertices: corners.map((i) => ({
        position: point(i),
        uv: toUV(point(i)),
      })),
      edges: corners.map((i, k): EdgeNeighbour => {
        const j = at(corners, k + 1);
        return [
          this.#side(face, ids[i], at(ids, i + 1), 0),
          this.#side(face, at(ids, j - 1), at(ids, j), 1),
        ];
      }),
    };
  }
}
