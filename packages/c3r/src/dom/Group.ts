import type { ReadonlyMat4 } from "gl-matrix";

import {
  MeshBuilder,
  type MeshFace,
  type TriangleList,
} from "../math/MeshBuilder.js";
import type { Vertex } from "../math/Vertex.js";

import { Object3D } from "./Object3D.js";
import { Polygon, type PolygonOptions } from "./Polygon.js";

const parents = new WeakMap<Object3D, Group>();

export interface IndexedMesh {
  positions: ArrayLike<number>;
  uvs: ArrayLike<number>;
  cells: ArrayLike<number>;
}

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
    return faces.map(({ vertices, edges }) =>
      this.addPolygon(vertices, { ...options, edges }),
    );
  }

  // Merges coplanar neighbours, e.g. two triangles into a quad
  addTriangles(triangles: TriangleList, options?: PolygonOptions): Polygon[] {
    return this.addFaces(new MeshBuilder([triangles]).faces(0), options);
  }

  addMesh(
    { positions, uvs, cells }: IndexedMesh,
    options?: PolygonOptions,
  ): Polygon[] {
    const vertex = (i: number): Vertex => ({
      position: [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]],
      uv: [uvs[i * 2], uvs[i * 2 + 1]],
    });
    const triangles: Vertex[][] = [];
    for (let i = 0; i + 2 < cells.length; i += 3) {
      triangles.push([
        vertex(cells[i]),
        vertex(cells[i + 1]),
        vertex(cells[i + 2]),
      ]);
    }
    return this.addTriangles(triangles, options);
  }
}
