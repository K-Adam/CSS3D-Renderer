import type { ReadonlyMat4 } from "gl-matrix";

import { MeshBuilder, type MeshFace } from "../math/MeshBuilder.js";
import type { Vertex } from "../math/Vertex.js";

import { Object3D } from "./Object3D.js";
import { defaultDomSize, Polygon, type PolygonOptions } from "./Polygon.js";

const MAX_DOM_SIZE = 4096;

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

  addFaces(faces: readonly MeshFace[], options?: PolygonOptions): Polygon[] {
    const domSize = options?.getDomSize ?? defaultDomSize;
    return faces.map(({ vertices, edges, unit }) =>
      this.addPolygon(vertices, {
        ...options,
        edges,
        getDomSize: (size) =>
          Math.min(
            Math.max(domSize(size), (domSize(unit) / unit) * size),
            MAX_DOM_SIZE,
          ),
      }),
    );
  }

  // Merges coplanar neighbours, e.g. two triangles into a quad
  addTriangles(
    triangles: readonly (readonly Vertex[])[],
    options?: PolygonOptions,
  ): Polygon[] {
    return this.addFaces(new MeshBuilder([triangles]).faces(0), options);
  }
}
