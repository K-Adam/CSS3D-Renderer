import { plainValue } from "./styles.js";

// Typed OM unit names, so a later move onto the platform keeps them
export type Unit = "number" | "px" | "rad";

type Arg = CssValue | number;

export type CssNode =
  | { readonly kind: "unit"; readonly value: number; readonly unit: Unit }
  | {
      readonly kind: "math";
      readonly op: "+" | "-" | "*" | "/";
      readonly left: Arg;
      readonly right: Arg;
    }
  | {
      readonly kind: "ref";
      readonly fn: "var";
      readonly name: string;
      readonly syntax: string;
      readonly fallback: CssValue | null;
    }
  | {
      readonly kind: "fn";
      readonly name: CssFunction;
      readonly type: CssFunctionType;
      readonly args: readonly Arg[];
    }
  | { readonly kind: "matrixProduct"; readonly factors: readonly CssValue[] }
  | {
      readonly kind: "raw";
      readonly text: string;
      readonly type: string | null;
    };

// What each function produces, a math one typed by its arguments. Only
// comma-separated functions, and none loads a resource or reads the page
const functionTypes = {
  matrix: "<transform-function>",
  matrix3d: "<transform-function>",
  translate: "<transform-function>",
  translate3d: "<transform-function>",
  translateX: "<transform-function>",
  translateY: "<transform-function>",
  translateZ: "<transform-function>",
  scale: "<transform-function>",
  scale3d: "<transform-function>",
  scaleX: "<transform-function>",
  scaleY: "<transform-function>",
  scaleZ: "<transform-function>",
  rotate: "<transform-function>",
  rotate3d: "<transform-function>",
  rotateX: "<transform-function>",
  rotateY: "<transform-function>",
  rotateZ: "<transform-function>",
  skew: "<transform-function>",
  skewX: "<transform-function>",
  skewY: "<transform-function>",
  perspective: "<transform-function>",
  brightness: "<filter-function>",
  contrast: "<filter-function>",
  grayscale: "<filter-function>",
  "hue-rotate": "<filter-function>",
  invert: "<filter-function>",
  opacity: "<filter-function>",
  saturate: "<filter-function>",
  sepia: "<filter-function>",
  rgb: "<color>",
  hsl: "<color>",
  min: "<math-function>",
  max: "<math-function>",
  clamp: "<math-function>",
  round: "<math-function>",
  mod: "<math-function>",
  rem: "<math-function>",
  abs: "<math-function>",
  sign: "<math-function>",
  sin: "<math-function>",
  cos: "<math-function>",
  tan: "<math-function>",
  asin: "<math-function>",
  acos: "<math-function>",
  atan: "<math-function>",
  atan2: "<math-function>",
  pow: "<math-function>",
  sqrt: "<math-function>",
  hypot: "<math-function>",
  log: "<math-function>",
  exp: "<math-function>",
} as const;

export type CssFunction = keyof typeof functionTypes;
export type CssFunctionType = (typeof functionTypes)[CssFunction];

// The argument types a math function takes and the type it gives, a missing one
// takes any numeric type and gives it back
const mathTypes: Partial<Record<CssFunction, readonly [string[], string]>> = {
  sign: [[], "<number>"],
  sin: [["<number>", "<angle>"], "<number>"],
  cos: [["<number>", "<angle>"], "<number>"],
  tan: [["<number>", "<angle>"], "<number>"],
  asin: [["<number>"], "<angle>"],
  acos: [["<number>"], "<angle>"],
  atan: [["<number>"], "<angle>"],
  atan2: [[], "<angle>"],
  pow: [["<number>"], "<number>"],
  sqrt: [["<number>"], "<number>"],
  log: [["<number>"], "<number>"],
  exp: [["<number>"], "<number>"],
};

const unitTypes: Record<Unit, string> = {
  number: "<number>",
  px: "<length>",
  rad: "<angle>",
};
const numeric = new Set<string | null>(Object.values(unitTypes));

// Only the factories can construct, a subclass could pass any text
const key = Symbol();

const finite = (n: number): number => {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid number ${n}`);
  return n === 0 ? 0 : n;
};

let create: (node: CssNode, text: string) => CssValue;
let read: (value: CssValue) => { node: CssNode; text: string };
let isMade: (value: object) => boolean;

export class CssValue {
  readonly #node: CssNode;
  readonly #text: string;

  static {
    create = (node, text) => new CssValue(key, node, text);
    read = (value) => ({ node: value.#node, text: value.#text });
    isMade = (value) => #node in value;
  }

  private constructor(k: symbol, node: CssNode, text: string) {
    if (k !== key) throw new TypeError("Not a CssValue");
    this.#node = Object.freeze(node);
    this.#text = text;
    // An own toString or node can't shadow the printed text
    Object.freeze(this);
  }

  get node(): CssNode {
    return this.#node;
  }

  toString(): string {
    return this.#text;
  }

  static number(value: number): CssValue {
    return CssValue.#unit(value, "number");
  }

  static px(value: number): CssValue {
    return CssValue.#unit(value, "px");
  }

  static rad(value: number): CssValue {
    return CssValue.#unit(value, "rad");
  }

  static add(left: Arg, right: Arg): CssValue {
    return CssValue.#math("+", left, right);
  }

  static sub(left: Arg, right: Arg): CssValue {
    return CssValue.#math("-", left, right);
  }

  static mul(left: Arg, right: Arg): CssValue {
    return CssValue.#math("*", left, right);
  }

  static div(left: Arg, right: Arg): CssValue {
    return CssValue.#math("/", left, right);
  }

  static fn(name: CssFunction, ...args: Arg[]): CssValue {
    if (!Object.hasOwn(functionTypes, name))
      throw new RangeError(`Unsupported function ${name}`);
    const values = args.map(checked);
    return create(
      {
        kind: "fn",
        name,
        type: functionTypes[name],
        args: Object.freeze(values),
      },
      `${name}(${values.map((v) => print(v)).join()})`,
    );
  }

  // a × b, so b applies first. Null and empty factors are the identity
  static matrixMultiply(...factors: (CssValue | null)[]): CssValue {
    const kept = factors.filter(
      (f): f is CssValue => f !== null && print(checked(f)) !== "",
    );
    for (const f of kept) {
      const type = typeOf(f);
      if (type !== "<transform-function>" && type !== "<transform-list>")
        throw new TypeError(`matrixMultiply takes transforms, not ${print(f)}`);
    }
    return create(
      { kind: "matrixProduct", factors: Object.freeze(kept) },
      kept.map((f) => print(f)).join(" "),
    );
  }

  static #unit(value: number, unit: Unit): CssValue {
    const n = finite(value);
    return create(
      { kind: "unit", value: n, unit },
      `${n}${unit === "number" ? "" : unit}`,
    );
  }

  static #math(op: "+" | "-" | "*" | "/", left: Arg, right: Arg): CssValue {
    const l = checked(left);
    const r = checked(right);
    return create(
      { kind: "math", op, left: l, right: r },
      `calc(${print(l, true)} ${op} ${print(r, true)})`,
    );
  }
}

function checked<T extends Arg>(value: T): T {
  if (typeof value === "number") return finite(value) as T;
  if (typeof value !== "object" || value === null || !isMade(value))
    throw new TypeError("Not a CssValue");
  return value;
}

export const textOf = (value: CssValue): string => read(checked(value)).text;

// The type a value computes to, null when unknown or invalid
export function typeOf(value: Arg): string | null {
  if (typeof value === "number") return "<number>";
  const { node } = read(checked(value));
  switch (node.kind) {
    case "unit":
      return unitTypes[node.unit];
    case "ref":
      return node.syntax;
    case "raw":
      return node.type;
    case "matrixProduct":
      return "<transform-list>";
    case "fn": {
      if (node.type !== "<math-function>") return node.type;
      const types = new Set(node.args.map(typeOf));
      const [type] = types;
      if (types.size !== 1 || !numeric.has(type)) return null;
      const [takes = [], gives = type] = mathTypes[node.name] ?? [];
      return !takes.length || takes.includes(type!) ? gives : null;
    }
    case "math": {
      const left = typeOf(node.left);
      const right = typeOf(node.right);
      if (!numeric.has(left) || !numeric.has(right)) return null;
      if (node.op === "+" || node.op === "-")
        return left === right ? left : null;
      if (node.op === "*")
        return left === "<number>" ? right : right === "<number>" ? left : null;
      // A unit over a unit needs typed arithmetic, which Firefox lacks
      return right === "<number>" ? left : null;
    }
  }
}

// Inside calc() a nested calc() only needs its parentheses
function print(value: Arg, operand = false): string {
  if (typeof value === "number") return String(value);
  const { node, text } = read(value);
  return operand && node.kind === "math" ? text.slice("calc".length) : text;
}

// Internal: users only get the references an Accumulator hands them
export function cssVar(
  name: string,
  syntax: string,
  fallback?: CssValue,
): CssValue {
  if (!/^--[\w-]+$/.test(name)) throw new RangeError(`Invalid name ${name}`);
  const or = fallback === undefined ? null : checked(fallback);
  return create(
    { kind: "ref", fn: "var", name, syntax, fallback: or },
    or ? `var(${name}, ${textOf(or)})` : `var(${name})`,
  );
}

// Internal: bridges text the library built itself, such as tween arguments
export function cssRaw(text: string, type: string | null = null): CssValue {
  if (!plainValue(text, true)) throw new RangeError(`Invalid value ${text}`);
  return create({ kind: "raw", text, type }, text);
}
