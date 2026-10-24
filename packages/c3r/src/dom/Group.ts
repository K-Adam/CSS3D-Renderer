import { vec2, vec3, type mat4, type ReadonlyVec3 } from "gl-matrix";

import { Triangle } from "../math/Triangle.js";
import type { Vertex } from "../math/Vertex.js";

import { Object3D } from "./Object3D.js";
import { Polygon } from "./Polygon.js";

export class Group extends Object3D {
  readonly children: Object3D[] = [];

  #vertCache: Vertex[] | null = null;
  #normCache: ReadonlyVec3 | null = null;
  #vec2tex: mat4 | null = null;

  constructor() {
    super();

    this.domElement.classList.add("c3r-group");
  }

  addChild(obj: Object3D): void {
    this.children.push(obj);
    this.domElement.appendChild(obj.domElement);
  }

  removeChild(obj: Object3D): void {
    const index = this.children.indexOf(obj);

    if (index > -1) {
      this.removeChildIndex(index);
    }
  }

  removeChildIndex(index: number): void {
    const [obj] = this.children.splice(index, 1);
    obj?.domElement.remove();
  }

  clear(): void {
    for (const obj of this.children.splice(0)) {
      obj.domElement.remove();
    }
  }

  addPolygon(vertices: Vertex[], element: HTMLElement | null = null): Polygon {
    const poly = new Polygon(vertices, element);

    poly.updateMatrix();
    poly.updateContent();

    this.addChild(poly);

    return poly;
  }

  // Adding triangles with this method makes it possible to reconstruct polygons (like quads)
  // The polygon (defined by vertices) will be added at last when flushPolygons() is called
  pushPolygon(vertices: Vertex[]): void {
    // TODO: if vertices.length > 3, then we should compare more than 1 edge

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
      return;

    const { norm } = tri;

    if (this.#vertCache && this.#normCache && this.#vec2tex) {
      if (
        !vec3.equals(this.#normCache, norm) ||
        !this.#merge(this.#vertCache, this.#vec2tex, vertices)
      ) {
        this.flushPolygons();
      }
    }

    if (!this.#vertCache) {
      this.#vertCache = vertices;
      this.#normCache = norm;

      const uvPoint = (v: Vertex) => vec3.fromValues(v.uv[0], v.uv[1], 0);

      this.#vec2tex = new Triangle(
        vertices[0].position,
        vertices[1].position,
        vertices[2].position,
        norm,
      ).getTransformationTo(
        new Triangle(
          uvPoint(vertices[0]),
          uvPoint(vertices[1]),
          uvPoint(vertices[2]),
        ),
      );
    }
  }

  // Inserts the vertices into the cached polygon if the two share an edge and the texture mapping
  #merge(cache: Vertex[], vec2tex: mat4, vertices: Vertex[]): boolean {
    const same = (a: Vertex, b: Vertex) =>
      vec2.equals(a.uv, b.uv) && vec3.equals(a.position, b.position);

    for (let i = 0; i < cache.length; i++) {
      for (let j = 0; j < vertices.length; j++) {
        // If we find the same point in both of them, then compare the other vertex on the edge
        if (!same(cache[i], vertices[j])) continue;
        if (
          !same(
            cache[(i + 1) % cache.length],
            vertices[(j + vertices.length - 1) % vertices.length],
          )
        ) {
          continue;
        }

        const ins: Vertex[] = [];
        for (let k = 1; k < vertices.length - 1; k++) {
          ins.push(vertices[(j + k) % vertices.length]);
        }

        const mapped = ins.every((v) => {
          const uv = vec3.transformMat4(vec3.create(), v.position, vec2tex);
          return vec2.equals([uv[0], uv[1]], v.uv);
        });
        if (!mapped) continue;

        this.#vertCache = [
          ...cache.slice(0, i + 1),
          ...ins,
          ...cache.slice(i + 1),
        ];
        return true;
      }
    }

    return false;
  }

  flushPolygons(): void {
    if (this.#vertCache) {
      this.addPolygon(this.#vertCache);

      this.#vertCache = null;
      this.#normCache = null;
      this.#vec2tex = null;
    }
  }
}
