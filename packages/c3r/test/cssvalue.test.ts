import { expect, it } from "vitest";
import { CssValue } from "c3r";
import { CssMatrix, CssVector } from "../src/css/CssMatrix.js";
import {
  cssRaw,
  cssVar,
  matrixMultiply,
  textOf,
  typeOf,
} from "../src/css/CssValue.js";

const x = cssVar("--x", "<number>");

it("prints math as calc, nesting in parentheses", () => {
  expect(String(CssValue.mul(CssValue.add(1, x), 2))).toBe(
    "calc((1 + var(--x)) * 2)",
  );
  expect(String(CssValue.fn("rotateY", CssValue.mul(-1, x)))).toBe(
    "rotateY(calc(-1 * var(--x)))",
  );
  expect(String(CssValue.fn("matrix3d", 1, 0, -0, 2))).toBe(
    "matrix3d(1,0,0,2)",
  );
});

it("matrix multiplies transforms only, skipping identities", () => {
  const turn = CssValue.fn("rotateX", CssValue.rad(1));
  const list = cssVar("--t", "<transform-list>", matrixMultiply());
  expect(String(matrixMultiply(turn, null, matrixMultiply(), list))).toBe(
    "rotateX(1rad) var(--t, )",
  );
  for (const value of [x, CssValue.number(2), CssValue.fn("opacity", 1)])
    expect(() => matrixMultiply(value)).toThrow(TypeError);
});

it("types values by what they compute to", () => {
  const { px, rad, add, mul, div, fn } = CssValue;
  expect(typeOf(px(1))).toBe("<length>");
  expect(typeOf(mul(px(1), x))).toBe("<length>");
  expect(typeOf(div(px(1), px(2)))).toBe("<number>");
  expect(typeOf(add(px(1), 1))).toBeNull();
  expect(typeOf(fn("sin", rad(1)))).toBe("<number>");
  expect(typeOf(matrixMultiply())).toBe("<transform-list>");
  const turn = fn("rotate", rad(1));
  for (const invalid of [
    add(turn, turn),
    div(px(1), rad(1)),
    div(1, px(1)),
    fn("min", 1, px(1)),
    fn("sqrt", px(1)),
    fn("asin", rad(1)),
  ])
    expect(typeOf(invalid)).toBeNull();
});

it("builds matrices column-major from numbers or expressions", () => {
  const m = new CssMatrix(new Float32Array([1, 2, 3, 4]));
  expect(m.size).toBe(2);
  expect(m.transpose().components.map(String)).toEqual(["1", "3", "2", "4"]);
  expect(CssMatrix.identity(2).components.map(String)).toEqual([
    "1",
    "0",
    "0",
    "1",
  ]);
  const [first, second] = m.mul(new CssMatrix([x, 0, 0, 1])).components;
  expect(String(first)).toBe("calc((1 * var(--x)) + (3 * 0))");
  expect(String(second)).toBe("calc((2 * var(--x)) + (4 * 0))");
  expect(m.transform(new CssVector([x, 1])).components.map(String)).toEqual([
    "calc((1 * var(--x)) + (3 * 1))",
    "calc((2 * var(--x)) + (4 * 1))",
  ]);
});

it("does vector algebra through CSS math", () => {
  const v = new CssVector([x, 2]);
  const w = new CssVector([3, 4]);
  expect(String(v.dot(w))).toBe("calc((var(--x) * 3) + (2 * 4))");
  expect(String(v.length())).toBe("hypot(var(--x),2)");
  expect(String(v.add(w).components[0])).toBe("calc(var(--x) + 3)");
  expect(String(v.sub(w).components[1])).toBe("calc(2 - 4)");
  expect(String(v.scale(2).components[1])).toBe("calc(2 * 2)");
  expect(String(v.normalize().components[1])).toBe(
    "calc(2 / hypot(var(--x),2))",
  );
});

it("refuses components and sizes that can't work", () => {
  const { px, fn } = CssValue;
  for (const bad of [px(1), fn("rotate", CssValue.rad(1))]) {
    expect(() => new CssVector([bad])).toThrow(TypeError);
    expect(() => new CssMatrix([bad])).toThrow(TypeError);
  }
  const fake = Object.create(CssValue.prototype) as CssValue;
  expect(() => new CssVector([fake])).toThrow(TypeError);
  expect(() => new CssVector([NaN])).toThrow(RangeError);
  expect(() => new CssVector([])).toThrow(RangeError);
  expect(() => new CssMatrix([])).toThrow(RangeError);
  expect(() => new CssMatrix([1, 2, 3])).toThrow(RangeError);
  const m2 = CssMatrix.identity(2);
  const m3 = CssMatrix.identity(3);
  const v2 = new CssVector([1, 2]);
  const v3 = new CssVector([1, 2, 3]);
  expect(() => m2.mul(m3)).toThrow(RangeError);
  expect(() => m2.transform(v3)).toThrow(RangeError);
  expect(() => v2.dot(v3)).toThrow(RangeError);
  expect(() => v2.add(v3)).toThrow(RangeError);
});

it("refuses values that could leave the declaration", () => {
  for (const build of [
    () => CssValue.number(NaN),
    () => CssValue.fn("url" as never, 1),
    () => CssValue.fn("rotatex" as never, 1),
    () => cssVar("--x; color: red", "<number>"),
    () => cssRaw("0; } * {color:red}"),
  ])
    expect(build).toThrow(RangeError);
  const fake = Object.create(CssValue.prototype) as CssValue;
  expect(() => CssValue.mul(2, fake)).toThrow(TypeError);
  const Forged = class extends (CssValue as unknown as new () => object) {};
  expect(() => Reflect.construct(Forged, [], CssValue)).toThrow(TypeError);
  const value = CssValue.number(1);
  expect(() =>
    Object.defineProperty(value, "toString", { value: () => "x; y" }),
  ).toThrow(TypeError);
  expect(textOf(value)).toBe("1");
});
