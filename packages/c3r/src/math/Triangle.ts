import { mat4, vec3, type ReadonlyVec3 } from "gl-matrix";

export class Triangle {
  readonly p1: ReadonlyVec3;
  readonly p2: ReadonlyVec3;
  readonly p3: ReadonlyVec3;
  readonly norm: ReadonlyVec3;

  readonly #edges: [vec3, vec3, vec3];

  constructor(
    p1: ReadonlyVec3,
    p2: ReadonlyVec3,
    p3: ReadonlyVec3,
    norm?: ReadonlyVec3,
  ) {
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;

    this.#edges = [
      vec3.sub(vec3.create(), p1, p2),
      vec3.sub(vec3.create(), p2, p3),
      vec3.sub(vec3.create(), p3, p1),
    ];

    this.norm = norm ?? this.calculateNormal();
  }

  calculateNormal(): vec3 {
    const [e1, e2] = this.#edges;
    return vec3.normalize(vec3.create(), vec3.cross(vec3.create(), e1, e2));
  }

  calculateEdgeLengths(): [number, number, number] {
    const [e1, e2, e3] = this.#edges;
    return [vec3.len(e1), vec3.len(e2), vec3.len(e3)];
  }

  calculateArea(): number {
    const [e1, e2] = this.#edges;
    return vec3.len(vec3.cross(vec3.create(), e1, e2)) / 2;
  }

  getTransformationTo(that: Triangle): mat4 {
    const A = Triangle.#basis(this);
    const AI = mat4.invert(A, A);
    if (!AI) throw new Error("Degenerate triangle");

    return mat4.mul(AI, Triangle.#basis(that), AI);
  }

  static #basis({ p1, p2, p3, norm }: Triangle): mat4 {
    // prettier-ignore
    return mat4.fromValues(
            p1[0], p1[1], p1[2], 1,
            p2[0], p2[1], p2[2], 1,
            p3[0], p3[1], p3[2], 1,
            norm[0], norm[1], norm[2], 0,
        );
  }
}
