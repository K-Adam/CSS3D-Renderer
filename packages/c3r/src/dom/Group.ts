import { type CssValue, cssVar } from "../css/CssValue.js";
import {
  composeTransforms,
  ownTransform,
  type Transform,
} from "../css/Transform.js";
import { setTweens, type Tween } from "../css/Tween.js";
import {
  MeshBuilder,
  type MeshFace,
  type TriangleList,
} from "../math/MeshBuilder.js";
import type { Vertex } from "../math/Vertex.js";

import { moveTargets, refreshInput } from "./Accumulator.js";
import { Object3D, parents } from "./Object3D.js";
import { Polygon, type PolygonOptions } from "./Polygon.js";

// Keeps the tweens, and their rules, alive while their element is
const elementTweens = new WeakMap<Element, readonly Tween[]>();

export interface IndexedMesh {
  positions: ArrayLike<number>;
  uvs: ArrayLike<number>;
  cells: ArrayLike<number>;
}

export class Group extends Object3D {
  readonly #children: Object3D[] = [];
  #transform: Transform | readonly Transform[] = [];
  #tween: Tween | readonly Tween[] | null = null;
  #clock = false;

  constructor() {
    super();

    this.domElement.classList.add("c3r-group");
  }

  get transform(): Transform | readonly Transform[] {
    return this.#transform;
  }

  set transform(transform: Transform | readonly Transform[]) {
    const matrix = composeTransforms(transform);
    this.#transform = ownTransform(transform);
    this.setMatrix(matrix);
  }

  get tween(): Tween | readonly Tween[] | null {
    return this.#tween;
  }

  set tween(tween: Tween | readonly Tween[] | null) {
    const { classList, style } = this.domElement;
    const tweens = setTweens(
      style,
      tween,
      false,
      this.#clock ? "c3r-time 3600s linear infinite" : "",
    );
    for (const old of elementTweens.get(this.domElement) ?? [])
      classList.remove(old.className);
    for (const { className } of tweens) classList.add(className);
    elementTweens.set(this.domElement, tweens);
    this.#tween = Array.isArray(tween) ? tweens : tween;
    refreshInput(this);
  }

  // Seconds, read where a group above runs its clock
  static readonly time: CssValue = cssVar("--c3r-time", "<number>");

  // Opt-in, every frame restyles the group's subtree
  get clock(): boolean {
    return this.#clock;
  }

  set clock(clock: boolean) {
    if (clock === this.#clock) return;
    this.#clock = clock;
    this.tween = this.#tween;
  }

  get children(): readonly Object3D[] {
    return this.#children;
  }

  addChild(obj: Object3D): void {
    if (obj.domElement.contains(this.domElement))
      throw new RangeError("A group can't contain its ancestor");
    parents.get(obj)?.removeChild(obj);
    parents.set(obj, this);
    moveTargets(obj, 1);
    this.#children.push(obj);
    this.domElement.appendChild(obj.domElement);
  }

  removeChild(obj: Object3D): void {
    const index = this.#children.indexOf(obj);
    if (index < 0) return;

    this.#children.splice(index, 1);
    moveTargets(obj, -1);
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
