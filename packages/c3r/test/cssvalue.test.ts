import { expect, it } from "vitest";
import { CssValue } from "c3r";
import { cssRaw, cssVar, textOf } from "../src/css/CssValue.js";

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
  for (const value of [
    x,
    CssValue.number(2),
    CssValue.fn("blur", CssValue.px(1)),
  ])
    expect(() => CssValue.matrixMultiply(value)).toThrow(TypeError);
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
