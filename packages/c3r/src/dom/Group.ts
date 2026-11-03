import { type CssValue, cssVar, typeOf } from "../css/CssValue.js";
import { touchFollower } from "../css/Timeline.js";
import {
  composeTransforms,
  ownTransform,
  type Transform,
  vector,
} from "../css/Transform.js";
import {
  setTweenClasses,
  setTweens,
  touchTweens,
  type Tween,
} from "../css/Tween.js";
import {
  MeshBuilder,
  type MeshFace,
  type TriangleList,
} from "../math/MeshBuilder.js";
import type { Vertex } from "../math/Vertex.js";

import { moveTargets, refreshInput } from "./Accumulator.js";
import { Object3D, parents } from "./Object3D.js";
import { Polygon, type PolygonOptions } from "./Polygon.js";
import type { ShadowCaster } from "./Shadows.js";

export interface IndexedMesh {
  positions: ArrayLike<number>;
  uvs: ArrayLike<number>;
  cells: ArrayLike<number>;
  normals?: ArrayLike<number>;
}

export interface MeshOptions extends PolygonOptions {
  // A point light has no seams between triangles kept apart, at twice the polygons
  splitCurved?: boolean;
}

// An element put in the document starts its animations over, so the next
// bake brings their timelines in step
export const touchSubtree = (obj: Object3D): void => {
  touchFollower(obj);
  if (!(obj instanceof Group)) return;
  touchTweens(obj.tween);
  obj.children.forEach(touchSubtree);
};

export class Group extends Object3D {
  readonly #children: Object3D[] = [];
  #transform: Transform | readonly Transform[] = [];
  #tween: Tween | readonly Tween[] | null = null;
  #clock = false;
  #lightGain: number | CssValue = 1;
  #shadowCaster: ShadowCaster | null = null;

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
    const { style } = this.domElement;
    const tweens = setTweens(
      style,
      tween,
      false,
      this.#clock ? "c3r-time 3600s linear infinite" : "",
    );
    setTweenClasses(this.domElement, tweens);
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

  get lightGain(): number | CssValue {
    return this.#lightGain;
  }

  set lightGain(gain: number | CssValue) {
    const valid =
      typeof gain === "number"
        ? gain >= 0 && Number.isFinite(gain)
        : typeOf(gain) === "<number>";
    if (!valid) throw new RangeError(`Invalid light gain ${gain}`);
    this.#lightGain = gain;
    refreshInput(this);
  }

  // Takes effect at the next bake, like shading
  get shadowCaster(): ShadowCaster | null {
    return this.#shadowCaster;
  }

  set shadowCaster(caster: ShadowCaster | null) {
    if (!caster) {
      this.#shadowCaster = null;
      return;
    }
    const sizes =
      caster.shape === "box"
        ? vector(caster.size)
        : caster.shape === "cylinder"
          ? [caster.radius, caster.height]
          : caster.shape === "sphere"
            ? [caster.radius]
            : [NaN];
    if (!sizes.every((n) => n > 0 && Number.isFinite(n)))
      throw new RangeError(`Invalid shadow caster ${JSON.stringify(caster)}`);
    this.#shadowCaster = Object.freeze(
      caster.shape === "box"
        ? { shape: "box", size: Object.freeze(sizes) }
        : { ...caster },
    );
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
    touchSubtree(obj);
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
    return faces.map(({ vertices, edges, planar }) =>
      this.addPolygon(vertices, {
        ...options,
        edges,
        planar: (planar ?? true) && options?.planar !== false,
      }),
    );
  }

  // Merges coplanar neighbours, e.g. two triangles into a quad
  addTriangles(
    triangles: TriangleList,
    { splitCurved, ...options }: MeshOptions = {},
  ): Polygon[] {
    return this.addFaces(
      new MeshBuilder([triangles], { splitCurved }).faces(0),
      options,
    );
  }

  addMesh(
    { positions, uvs, cells, normals }: IndexedMesh,
    options?: MeshOptions,
  ): Polygon[] {
    const vertex = (i: number): Vertex => ({
      position: [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]],
      uv: [uvs[i * 2], uvs[i * 2 + 1]],
      ...(normals && {
        normal: [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]],
      }),
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
