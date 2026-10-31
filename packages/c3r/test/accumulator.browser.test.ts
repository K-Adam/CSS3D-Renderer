import { afterEach, expect, it, vi } from "vitest";
import {
  Camera,
  Container,
  CssValue,
  Group,
  type Object3D,
  PerspectiveCamera,
  Transform,
} from "c3r";
import { cssVar, matrixMultiply } from "../src/css/CssValue.js";
import {
  Accumulator,
  type AccumulatorOptions,
} from "../src/dom/Accumulator.js";

afterEach(() => vi.restoreAllMocks());

const options = (name = "sum") => ({
  name,
  syntax: "<number>",
  identity: CssValue.number(0),
  combine: (parent: CssValue, input: CssValue) => CssValue.add(parent, input),
});

const sum = (name = "sum", input?: AccumulatorOptions["input"]) =>
  new Accumulator({ ...options(name), input });

const scene = () => {
  const container = new Container();
  document.body.append(container.domElement);
  return {
    root: container.root,
    container,
    [Symbol.dispose]: () => container.domElement.remove(),
  };
};

const group = (parent: Group | null, input?: number) => {
  const g = new Group();
  parent?.addChild(g);
  if (input !== undefined)
    g.domElement.style.setProperty("--sum-input", String(input));
  return g;
};

const value = (obj: Object3D, name = "sum") =>
  Number(getComputedStyle(obj.domElement).getPropertyValue(`--${name}`).trim());

const chained = (acc: Accumulator, obj: Object3D) =>
  obj.domElement.classList.contains(acc.className);

it("folds each path once, sharing the common ancestors", () => {
  using s = scene();
  using acc = sum();
  const a = group(s.root, 2);
  const b = group(a);
  const c = group(b, 3);
  const d = group(a);
  const off = group(s.root, 7);
  acc.addTarget(c);
  acc.addTarget(d);
  expect(value(c)).toBe(5);
  expect(value(d)).toBe(2);
  expect(value(off)).toBe(0);

  acc.removeTarget(c);
  expect([c, b, a].map((g) => chained(acc, g))).toEqual([false, false, true]);
});

it("refolds when a subtree moves to another depth", () => {
  using s = scene();
  using acc = sum();
  const a = group(s.root, 1);
  const b = group(a, 10);
  const moved = group(null, 100);
  const target = group(group(moved), 1000);
  acc.addTarget(target);
  b.addChild(moved);
  expect(value(target)).toBe(1111);
  a.addChild(moved);
  expect(value(target)).toBe(1101);
  expect(chained(acc, b)).toBe(false);

  let parent = a;
  for (let i = 0; i < 5; i++) parent = group(parent, 1);
  parent.addChild(moved);
  expect(value(target)).toBe(1106);
});

it("follows a new root", () => {
  using s = scene();
  using acc = sum();
  const a = group(s.root, 2);
  const b = group(a, 3);
  const target = group(b, 4);
  acc.addTarget(target);
  // Still another group's child
  s.container.root = b;
  expect(chained(acc, a)).toBe(false);
  expect(value(target)).toBe(7);
});

const rules = () =>
  document.adoptedStyleSheets.map((s) => s.cssRules.length).join();

it("rejects invalid options", () => {
  const before = rules();
  for (const bad of [
    { syntax: '<number>"' },
    { name: "c3r-facing2" },
    { name: "a b" },
    { identity: matrixMultiply() },
    { identity: cssVar("--x", "<number>") },
  ])
    expect(() => new Accumulator({ ...options("safe"), ...bad })).toThrow(
      RangeError,
    );
  const fake = Object.create(CssValue.prototype) as CssValue;
  for (const bad of [{ identity: fake }, { combine: () => fake }])
    expect(() => new Accumulator({ ...options("safe"), ...bad })).toThrow(
      TypeError,
    );
  expect(rules()).toBe(before);
});

it("frees its names, rules and chain on dispose", () => {
  using s = scene();
  const before = rules();
  const target = group(s.root);
  const first = sum("safe", () => CssValue.number(5));
  first.addTarget(target);
  expect(() => sum("safe")).toThrow(RangeError);
  expect(() => sum("safe-input")).toThrow(RangeError);
  first[Symbol.dispose]();
  expect(rules()).toBe(before);
  expect(chained(first, target)).toBe(false);
  using again = sum("safe");
  again.addTarget(target);
  expect(value(target, "safe")).toBe(0);
});

// The x translation, read back from the matrix the node writes
const x = (node: Object3D) =>
  node.domElement.style.getPropertyValue("--c3r-matrix").split(",")[12] ?? "0";

it("builds each input from its node and refreshes it", () => {
  using s = scene();
  let top = 100;
  using acc = sum("offset", (node) =>
    CssValue.number(node instanceof Camera ? top : Number(x(node))),
  );
  const a = group(s.root);
  a.transform = Transform.translate([10, 0, 0]);
  const target = group(a);
  target.transform = Transform.translate([5, 0, 0]);
  acc.addTarget(target);
  expect(value(target, "offset")).toBe(115);

  a.transform = Transform.translate([20, 0, 0]);
  expect(value(target, "offset")).toBe(125);
  top = 200;
  s.container.camera.transform = Transform.translate([0, 0, 1]);
  expect(value(target, "offset")).toBe(225);

  acc.removeTarget(target);
  expect(a.domElement.style.getPropertyValue("--offset-input")).toBe("");
});

it("reports a failing input rule and leaves the identity", () => {
  using s = scene();
  const reported = vi
    .spyOn(globalThis, "reportError")
    .mockImplementation(() => {});
  using acc = sum("faulty", (node) => {
    if (node instanceof Camera) return CssValue.number(1);
    throw new Error("rule failed");
  });
  const target = group(s.root);
  acc.addTarget(target);
  expect(reported).toHaveBeenCalledTimes(2);
  expect(value(target, "faulty")).toBe(1);
});

it("runs a camera's rule once its projection is set", () => {
  using s = scene();
  const reported = vi.spyOn(globalThis, "reportError");
  using acc = sum("fov", (node) =>
    CssValue.number(node instanceof PerspectiveCamera ? node.fov : 0),
  );
  const target = group(s.root);
  acc.addTarget(target);
  using camera = new PerspectiveCamera(50);
  s.container.camera = camera;
  camera.fov = 40;
  expect(value(target, "fov")).toBe(40);
  expect(reported).not.toHaveBeenCalled();
});

it("restarts the fold under a selector", () => {
  using s = scene();
  using acc = sum();
  const a = group(s.root, 2);
  a.domElement.classList.add("fresh");
  const target = group(group(a, 3), 4);
  acc.addTarget(target);
  acc.restartUnder(".fresh");
  expect(value(target)).toBe(7);
  expect(() => acc.restartUnder("x { }")).toThrow(RangeError);
  expect(() => acc.restartUnder(":not(a")).toThrow(RangeError);
});
