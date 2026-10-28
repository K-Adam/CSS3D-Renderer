import type { ReadonlyVec3 } from "gl-matrix";

import { radians, register } from "./steps.js";

const vector = (v: ReadonlyVec3, unit = ""): string[] => {
  const values = Array.from(v);
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw new RangeError(`Invalid vector ${values}`);
  return values.map((n) => n + unit);
};

const negate = (value: string) => `calc(-1 * ${value})`;

export class Transform {
  declare private readonly brand: "transform";

  private constructor() {}

  static #create(
    name: string,
    syntax: string,
    identity: string,
    values: string[],
    invert = negate,
  ): Transform {
    return register(new Transform(), {
      name,
      kind: "transform",
      syntax,
      identity,
      values,
      invert,
    });
  }

  // Scene units
  static translate(v: ReadonlyVec3): Transform {
    return Transform.#create("translate3d", "<length>", "0px", vector(v, "px"));
  }

  static rotateX(angle: number): Transform {
    return Transform.#create("rotateX", "<angle>", "0rad", [radians(angle)]);
  }

  static rotateY(angle: number): Transform {
    return Transform.#create("rotateY", "<angle>", "0rad", [radians(angle)]);
  }

  static rotateZ(angle: number): Transform {
    return Transform.#create("rotateZ", "<angle>", "0rad", [radians(angle)]);
  }

  static scale(s: number | ReadonlyVec3): Transform {
    const v = typeof s === "number" ? [s, s, s] : s;
    return Transform.#create(
      "scale3d",
      "<number>",
      "1",
      vector(v),
      (value) => `calc(1 / ${value})`,
    );
  }
}
