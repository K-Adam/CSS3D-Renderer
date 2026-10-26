import {
  vec2,
  vec3,
  type mat4,
  type ReadonlyMat4,
  type ReadonlyVec3,
} from "gl-matrix";

import { Triangle } from "../math/Triangle.js";
import type { Vertex } from "../math/Vertex.js";

import { Object3D } from "./Object3D.js";
import { Polygon, type PolygonOptions } from "./Polygon.js";

const parents = new WeakMap<Object3D, Group>();

export class Group extends Object3D {
  readonly #children: Object3D[] = [];

  constructor() {
    super();

    this.domElement.classList.add("c3r-group");
  }

  override get matrix(): ReadonlyMat4 {
    return super.matrix;
  }

  override set matrix(matrix: ReadonlyMat4) {
    this.setMatrix(matrix);
  }

  get children(): readonly Object3D[] {
    return this.#children;
  }

  addChild(obj: Object3D): void {
    parents.get(obj)?.removeChild(obj);
    parents.set(obj, this);
    this.#children.push(obj);
    this.domElement.appendChild(obj.domElement);
  }

  removeChild(obj: Object3D): void {
    const index = this.#children.indexOf(obj);
    if (index < 0) return;

    this.#children.splice(index, 1);
    parents.delete(obj);
    obj.domElement.remove();
  }

  clear(): void {
    for (const obj of [...this.#children]) this.removeChild(obj);
  }

  addPolygon(vertices: readonly Vertex[], options?: PolygonOptions): Polygon {
    const poly = new Polygon(vertices, options);
    this.addChild(poly);
    return poly;
  }

  // Merges coplanar neighbours, e.g. two triangles into a quad
  addTriangles(
    triangles: readonly (readonly Vertex[])[],
    options?: PolygonOptions,
  ): Polygon[] {
    const polygons: Polygon[] = [];
    let current: Face | null = null;

    for (const vertices of triangles) {
      const tri = new Triangle(
        vertices[0].position,
        vertices[1].position,
        vertices[2].position,
      );

      // Skip slivers
      if (
        tri.calculateArea() <=
        1e-6 * Math.max(...tri.calculateEdgeLengths()) ** 2
      )
        continue;

      if (current && vec3.equals(current.norm, tri.norm)) {
        const merged = merge(current, vertices);
        if (merged) {
          current.vertices = merged;
          continue;
        }
      }

      if (current) polygons.push(this.addPolygon(current.vertices, options));
      current = face(vertices, tri);
    }

    if (current) polygons.push(this.addPolygon(current.vertices, options));
    return polygons;
  }
}

interface Face {
  vertices: readonly Vertex[];
  norm: ReadonlyVec3;
  vec2tex: mat4;
}

const face = (vertices: readonly Vertex[], tri: Triangle): Face => {
  const uvPoint = (v: Vertex) => vec3.fromValues(v.uv[0], v.uv[1], 0);
  return {
    vertices,
    norm: tri.norm,
    vec2tex: tri.getTransformationTo(
      new Triangle(
        uvPoint(vertices[0]),
        uvPoint(vertices[1]),
        uvPoint(vertices[2]),
      ),
    ),
  };
};

// Inserts the triangle into the face if the two share an edge and the texture mapping
function merge(
  { vertices: face, vec2tex }: Face,
  tri: readonly Vertex[],
): Vertex[] | null {
  const same = (a: Vertex, b: Vertex) =>
    vec2.equals(a.uv, b.uv) && vec3.equals(a.position, b.position);

  for (let i = 0; i < face.length; i++) {
    for (let j = 0; j < 3; j++) {
      if (!same(face[i], tri[j])) continue;
      if (!same(face[(i + 1) % face.length], tri[(j + 2) % 3])) continue;

      const apex = tri[(j + 1) % 3];
      const uv = vec3.transformMat4(vec3.create(), apex.position, vec2tex);
      if (!vec2.equals([uv[0], uv[1]], apex.uv)) continue;

      return [...face.slice(0, i + 1), apex, ...face.slice(i + 1)];
    }
  }

  return null;
}
