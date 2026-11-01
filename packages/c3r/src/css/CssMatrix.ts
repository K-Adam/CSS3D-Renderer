import { type Arg, CssValue, typeOf } from "./CssValue.js";

export interface Composite {
  readonly components: readonly CssValue[];
  withComponents(components: readonly CssValue[]): Composite;
}

// A browser would silently drop an invalid expression
const numbers = (values: Iterable<Arg>): readonly CssValue[] =>
  Object.freeze(
    Array.from(values, (v) => {
      const value = typeof v === "number" ? CssValue.number(v) : v;
      if (typeOf(value) !== "<number>")
        throw new TypeError(`Not a <number>: ${value}`);
      return value;
    }),
  );

export class CssVector implements Composite {
  readonly components: readonly CssValue[];

  constructor(components: Iterable<Arg>) {
    this.components = numbers(components);
    if (!this.components.length)
      throw new RangeError("A vector needs at least one component");
    Object.freeze(this);
  }

  withComponents(components: readonly CssValue[]): CssVector {
    return new CssVector(components);
  }

  #zip(v: CssVector, op: (a: CssValue, b: CssValue) => CssValue): CssValue[] {
    if (v.components.length !== this.components.length)
      throw new RangeError(
        `Vector sizes differ: ${this.components.length} and ${v.components.length}`,
      );
    return this.components.map((c, i) => op(c, v.components[i]));
  }

  add(v: CssVector): CssVector {
    return new CssVector(this.#zip(v, CssValue.add));
  }

  sub(v: CssVector): CssVector {
    return new CssVector(this.#zip(v, CssValue.sub));
  }

  scale(k: Arg): CssVector {
    return new CssVector(this.components.map((c) => CssValue.mul(c, k)));
  }

  dot(v: CssVector): CssValue {
    return this.#zip(v, CssValue.mul).reduce((a, b) => CssValue.add(a, b));
  }

  length(): CssValue {
    return CssValue.fn("hypot", ...this.components);
  }

  normalize(): CssVector {
    const length = this.length();
    return new CssVector(this.components.map((c) => CssValue.div(c, length)));
  }
}

// Column-major, like gl-matrix and matrix3d()
export class CssMatrix implements Composite {
  readonly components: readonly CssValue[];
  readonly size: number;

  constructor(components: Iterable<Arg>) {
    this.components = numbers(components);
    this.size = Math.sqrt(this.components.length);
    if (!this.size || !Number.isInteger(this.size))
      throw new RangeError(
        `A square matrix can't have ${this.components.length} components`,
      );
    Object.freeze(this);
  }

  static identity(size: number): CssMatrix {
    return new CssMatrix(
      Array.from({ length: size * size }, (_, i) =>
        i % (size + 1) === 0 ? 1 : 0,
      ),
    );
  }

  withComponents(components: readonly CssValue[]): CssMatrix {
    return new CssMatrix(components);
  }

  #indices(): number[] {
    return Array.from({ length: this.size }, (_, i) => i);
  }

  #row(row: number): CssVector {
    return new CssVector(
      this.#indices().map(
        (column) => this.components[column * this.size + row],
      ),
    );
  }

  #column(column: number): CssVector {
    const start = column * this.size;
    return new CssVector(this.components.slice(start, start + this.size));
  }

  // this × m, so m applies first
  mul(m: CssMatrix): CssMatrix {
    return new CssMatrix(
      this.#indices().flatMap(
        (column) => this.transform(m.#column(column)).components,
      ),
    );
  }

  transform(v: CssVector): CssVector {
    return new CssVector(this.#indices().map((row) => this.#row(row).dot(v)));
  }

  transpose(): CssMatrix {
    return new CssMatrix(
      this.#indices().flatMap((row) => this.#row(row).components),
    );
  }
}
