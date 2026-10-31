import {
  mat3,
  mat4,
  quat,
  vec3,
  type ReadonlyMat4,
  type ReadonlyVec3,
} from "gl-matrix";

import { CssValue, cssRaw } from "./CssValue.js";
import { radians, register, type Step } from "./steps.js";

// Finite numbers only, an object's toString would reach the stylesheet
const vector = (v: ReadonlyVec3): [number, number, number] => {
  const values = Array.from(v);
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw new RangeError(`Invalid vector ${values}`);
  return values as [number, number, number];
};

const negate = (value: string) => String(CssValue.mul(-1, cssRaw(value)));

// Float32 overflows to Infinity, which CSS drops
export function allFinite(m: ReadonlyMat4): boolean {
  for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) return false;
  return true;
}

// A tween reaches a negative scale through zero
const scaleInverse = (scale: number[]) =>
  scale.every((n) => n > 0)
    ? (value: string) => String(CssValue.div(1, cssRaw(value)))
    : null;

interface Decomposed {
  translation: number[];
  axis: number[];
  angle: number;
  scale: number[];
}

// Null with perspective, shear or a zero scale, a tween can't split those
export function decompose(m: ReadonlyMat4): Decomposed | null {
  if (![m[3], m[7], m[11], m[15] - 1].every((n) => Math.abs(n) <= 1e-6))
    return null;
  const columns = [0, 4, 8].map((i) =>
    vec3.fromValues(m[i], m[i + 1], m[i + 2]),
  );
  const lengths = columns.map((c) => vec3.length(c));
  const max = Math.max(...lengths);
  if (!lengths.every((n) => n > 1e-6 * max)) return null;
  const rotation = (mirror: number) => {
    const scale = lengths.map((n, i) => (i === mirror ? -n : n));
    const r = new Float32Array(
      columns.flatMap((c, i) => Array.from(c, (n) => n / scale[i])),
    );
    const q = quat.fromMat3(quat.create(), r);
    quat.normalize(q, q);
    if (q[3] < 0) quat.scale(q, q, -1);
    const sine = Math.hypot(q[0], q[1], q[2]);
    return { scale, q, sine, angle: 2 * Math.atan2(sine, q[3]) };
  };
  // A mirror goes on the axis that leaves the least rotation
  const { scale, q, sine, angle } =
    mat3.determinant(mat3.fromMat4(mat3.create(), m)) > 0
      ? rotation(-1)
      : [0, 1, 2].map(rotation).reduce((a, b) => (b.angle < a.angle ? b : a));
  const translation = [m[12], m[13], m[14]];
  const rebuilt = mat4.fromRotationTranslationScale(
    mat4.create(),
    q,
    translation as vec3,
    scale as vec3,
  );
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10])
    if (!(Math.abs(rebuilt[i] - m[i]) <= 1e-4 * max)) return null;
  const axis =
    sine > 1e-9 ? [q[0], q[1], q[2]].map((n) => n / sine) : [0, 0, 1];
  return { translation, axis, angle, scale };
}

// Separate tracks, so a camera can invert each one
const matrixSteps = ({ translation, axis, angle, scale }: Decomposed) => {
  const turn = (rad: number) =>
    String(CssValue.fn("rotate3d", ...axis, CssValue.rad(rad)));
  return [
    {
      name: "matrix",
      fn: "translate3d",
      syntax: "<length>",
      identity: "0px",
      values: translation.map((n) => String(CssValue.px(n))),
    },
    {
      name: "matrix-rotate",
      syntax: "<transform-list>",
      identity: String(CssValue.fn("rotate3d", 0, 0, 1, CssValue.rad(0))),
      values: [turn(angle), turn(-angle)],
      invert: (value: string) => value,
      rotates: true,
    },
    {
      name: "matrix-scale",
      fn: "scale3d",
      syntax: "<number>",
      identity: "1",
      values: scale.map(String),
      invert: scaleInverse(scale),
    },
  ];
};

// Per frame and per node, so joined by hand from numbers already finite
export const matrixText = (m: ReadonlyMat4) => `matrix3d(${[...m].join()})`;

const matrices = new WeakMap<Transform, ReadonlyMat4>();

function matrixOf(transform: Transform): ReadonlyMat4 {
  const m = matrices.get(transform);
  if (!m) throw new TypeError("Not a Transform");
  return m;
}

export function composeTransforms(
  transform: Transform | readonly Transform[],
): ReadonlyMat4 {
  // Checked on creation, c3r-three sets one per node every frame
  if (!Array.isArray(transform)) return matrixOf(transform as Transform);
  const out = mat4.create();
  for (const t of transform) mat4.mul(out, out, matrixOf(t));
  if (!allFinite(out)) throw new RangeError(`Invalid transform ${[...out]}`);
  return out;
}

// A frozen copy, so the getter can't change with the caller's array
export const ownTransform = (
  transform: Transform | readonly Transform[],
): Transform | readonly Transform[] =>
  Array.isArray(transform) ? Object.freeze([...transform]) : transform;

export class Transform {
  declare private readonly brand: "transform";

  private constructor() {}

  static #create(
    matrix: ReadonlyMat4,
    steps: Omit<Step, "kind">[] | (() => Omit<Step, "kind">[]),
  ): Transform {
    if (!allFinite(matrix))
      throw new RangeError(`Invalid transform ${[...matrix]}`);
    const transform = new Transform();
    matrices.set(transform, matrix);
    const complete = (list: Omit<Step, "kind">[]): Step[] =>
      list.map((step) => ({ kind: "transform", invert: negate, ...step }));
    return register(
      transform,
      typeof steps === "function" ? () => complete(steps()) : complete(steps),
    );
  }

  static #rotate(
    name: string,
    from: (out: mat4, rad: number) => mat4,
    angle: number,
  ): Transform {
    return Transform.#create(from(mat4.create(), angle), [
      {
        name,
        syntax: "<angle>",
        identity: "0rad",
        values: [radians(angle)],
        rotates: true,
      },
    ]);
  }

  // Scene units
  static translate(v: ReadonlyVec3): Transform {
    const values = vector(v);
    return Transform.#create(mat4.fromTranslation(mat4.create(), values), [
      {
        name: "translate3d",
        syntax: "<length>",
        identity: "0px",
        values: values.map((n) => String(CssValue.px(n))),
        moves: true,
      },
    ]);
  }

  static rotateX(angle: number): Transform {
    return Transform.#rotate("rotateX", mat4.fromXRotation, angle);
  }

  static rotateY(angle: number): Transform {
    return Transform.#rotate("rotateY", mat4.fromYRotation, angle);
  }

  static rotateZ(angle: number): Transform {
    return Transform.#rotate("rotateZ", mat4.fromZRotation, angle);
  }

  static scale(s: number | ReadonlyVec3): Transform {
    const values = vector(typeof s === "number" ? [s, s, s] : s);
    return Transform.#create(mat4.fromScaling(mat4.create(), values), [
      {
        name: "scale3d",
        syntax: "<number>",
        identity: "1",
        values: values.map(String),
        invert: scaleInverse(values),
      },
    ]);
  }

  static matrix(m: ArrayLike<number>): Transform {
    const matrix = Float32Array.from(m);
    if (matrix.length !== 16)
      throw new RangeError(`A matrix takes 16 numbers, got ${matrix.length}`);
    return Transform.#create(matrix, () => {
      const parts = decompose(matrix);
      return parts ? matrixSteps(parts) : [];
    });
  }
}
