import { expect, it } from "vitest";
import { CssValue } from "c3r";
import { cssRaw, cssVar, textOf, typeOf } from "../src/css/CssValue.js";

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
  const list = cssVar("--t", "<transform-list>", CssValue.matrixMultiply());
  expect(
    String(
      CssValue.matrixMultiply(turn, null, CssValue.matrixMultiply(), list),
    ),
  ).toBe("rotateX(1rad) var(--t, )");
  for (const value of [x, CssValue.number(2), CssValue.fn("opacity", 1)])
    expect(() => CssValue.matrixMultiply(value)).toThrow(TypeError);
});

it("types values by what they compute to", () => {
  const { px, rad, add, mul, div, fn } = CssValue;
  expect(typeOf(px(1))).toBe("<length>");
  expect(typeOf(mul(px(1), x))).toBe("<length>");
  expect(typeOf(div(px(1), px(2)))).toBeNull();
  expect(typeOf(add(px(1), 1))).toBeNull();
  expect(typeOf(fn("sin", rad(1)))).toBe("<number>");
  expect(typeOf(CssValue.matrixMultiply())).toBe("<transform-list>");
  const turn = fn("rotate", rad(1));
  for (const invalid of [
    add(turn, turn),
    fn("min", 1, px(1)),
    fn("sqrt", px(1)),
    fn("asin", rad(1)),
  ])
    expect(typeOf(invalid)).toBeNull();
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
