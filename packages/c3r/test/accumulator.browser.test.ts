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
import { mat3, vec3 } from "gl-matrix";
import { CssMatrix, CssVector } from "../src/css/CssMatrix.js";
import { cssVar, matrixMultiply } from "../src/css/CssValue.js";
import {
  Accumulator,
  type AccumulatorOptions,
} from "../src/dom/Accumulator.js";
import { matrixOf } from "../src/dom/Object3D.js";

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

const chained = (acc: { className: string }, obj: Object3D) =>
  obj.domElement.classList.contains(acc.className);

it("folds inputs of another shape from a start that reads a variable", () => {
  using s = scene();
  s.container.domElement.style.setProperty("--start", "3");
  const a = group(s.root);
  using acc = new Accumulator<CssVector, CssMatrix>({
    name: "turned",
    syntax: "<number>",
    identity: new CssVector([0, 0]),
    start: new CssVector([cssVar("--start", "<number>"), 1]),
    inputIdentity: CssMatrix.identity(2),
    combine: (parent, input) => input.transform(parent),
    input: (node) => (node === a ? new CssMatrix([0, 1, -1, 0]) : null),
  });
  const target = group(a);
  acc.addTarget(target);
  expect(value(target, "turned-0")).toBeCloseTo(-1, 4);
  expect(value(target, "turned-1")).toBeCloseTo(3, 4);
  expect(a.domElement.style.getPropertyValue("--turned-3-input")).toBe("0");
});

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

it("forgets a disposed camera", () => {
  using s = scene();
  const camera = new PerspectiveCamera(50);
  s.container.camera = camera;
  camera.fov = 40;
  camera[Symbol.dispose]();
  const seen: unknown[] = [];
  using acc = sum("after", (node) => {
    seen.push(node);
    return CssValue.number(1);
  });
  expect(seen).not.toContain(camera);
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

const components = (obj: Object3D, name: string, count: number) =>
  Array.from({ length: count }, (_, k) =>
    Number(getComputedStyle(obj.domElement).getPropertyValue(`--${name}-${k}`)),
  );

const expectClose = (
  actual: number[],
  expected: ArrayLike<number>,
  digits = 4,
) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], digits));
};

const vectors = (name: string, input: AccumulatorOptions<CssVector>["input"]) =>
  new Accumulator({
    name,
    syntax: "<number>",
    identity: new CssVector([0, 0, 0]),
    combine: (parent, value) => parent.add(value),
    input,
  });

const START: [number, number, number] = [1, 2, 3];

const turnings = (
  name: string,
  input: AccumulatorOptions<CssVector, CssMatrix>["input"] = (node) =>
    node instanceof Camera
      ? null
      : new CssMatrix(mat3.fromMat4(mat3.create(), matrixOf(node))),
) =>
  new Accumulator<CssVector, CssMatrix>({
    name,
    syntax: "<number>",
    identity: new CssVector([0, 0, 0]),
    start: new CssVector(START),
    inputIdentity: CssMatrix.identity(3),
    combine: (parent, value) => value.transform(parent),
    input,
  });

const turnedBy = (...nodes: Object3D[]) =>
  nodes.reduce<vec3>(
    (v, node) =>
      vec3.transformMat3(v, v, mat3.fromMat4(mat3.create(), matrixOf(node))),
    // Float32 would drift on its own
    [...START],
  );

const turned = (parent: Group, i: number) => {
  const g = group(parent);
  g.transform = [
    Transform.rotateX(0.3 + i * 0.1),
    Transform.rotateY(0.2),
    Transform.scale([1, 1.01, 0.99]),
  ];
  return g;
};

it("folds a vector down shared ancestors", () => {
  using s = scene();
  const offsets = new Map<unknown, number[]>();
  using acc = vectors("offset3", (node) => {
    const v = offsets.get(node);
    return v ? new CssVector(v) : null;
  });
  const a = group(s.root);
  const b = group(a);
  const c = group(a);
  offsets.set(a, [1, 2, 3]);
  offsets.set(b, [10, 20, 30]);
  offsets.set(c, [100, 200, 300]);
  acc.addTarget(b);
  acc.addTarget(c);
  expect(components(b, "offset3", 3)).toEqual([11, 22, 33]);
  expect(components(c, "offset3", 3)).toEqual([101, 202, 303]);
});

it("turns a vector by each input root first, starting from the camera", () => {
  using s = scene();
  const A = mat3.fromValues(1, 2, 0, 0, 1, 0, 3, 0, 1);
  const B = mat3.fromValues(0, 1, 0, -1, 0, 0, 0, 0, 2);
  const C = mat3.fromValues(2, 0, 0, 0, 1, 4, 0, 0, 1);
  const a = group(s.root);
  const b = group(a);
  const matrices = new Map<unknown, mat3>([
    [s.container.camera, C],
    [a, A],
    [b, B],
  ]);
  using acc = turnings("product", (node) => {
    const m = matrices.get(node);
    return m ? new CssMatrix(m) : null;
  });
  // A camera registers on its first change
  s.container.camera.transform = Transform.translate([0, 0, 1]);
  acc.addTarget(b);
  const expected: vec3 = [...START];
  for (const m of [C, A, B]) vec3.transformMat3(expected, expected, m);
  expectClose(components(b, "product", 3), expected);
});

it("stays accurate at odd and even depths", () => {
  using s = scene();
  using acc = turnings("deep");
  let parent = s.root;
  const chain: Object3D[] = [s.root];
  for (let i = 0; i < 33; i++) {
    parent = turned(parent, i);
    chain.push(parent);
    const target = group(parent);
    acc.addTarget(target);
    // Browsers round at each level
    expectClose(components(target, "deep", 3), turnedBy(...chain), 3);
  }
});

it("restarts a vector fold under a selector", () => {
  using s = scene();
  using acc = turnings("restarted");
  const a = group(s.root);
  a.transform = Transform.rotateX(1);
  a.domElement.classList.add("fresh");
  const target = group(a);
  target.transform = Transform.rotateZ(1);
  acc.addTarget(target);
  acc.restartUnder(".fresh");
  expectClose(components(target, "restarted", 3), turnedBy(target));
});

it("reads a vector through its result", () => {
  using s = scene();
  using acc = turnings("readable");
  const target = group(s.root);
  target.transform = Transform.rotateZ(Math.PI / 2);
  acc.addTarget(target);
  CSS.registerProperty({
    name: "--read",
    syntax: "<number>",
    inherits: false,
    initialValue: "0",
  });
  target.domElement.style.setProperty(
    "--read",
    String(acc.result.components[1]),
  );
  expect(value(target, "read")).toBeCloseTo(1, 4);
});

it("leaves the whole identity after a wrong shape input", () => {
  using s = scene();
  const reported = vi
    .spyOn(globalThis, "reportError")
    .mockImplementation(() => {});
  using acc = turnings("shaped", (node) =>
    node instanceof Camera ? null : CssMatrix.identity(2),
  );
  const target = group(s.root);
  acc.addTarget(target);
  expect(reported).toHaveBeenCalled();
  expect(target.domElement.style.getPropertyValue("--shaped-0-input")).toBe("");
  expect(components(target, "shaped", 3)).toEqual(START);
});

it("rejects a vector's wrong shape or syntax before adding rules", () => {
  const before = rules();
  const composite = {
    name: "rejected",
    syntax: "<number>",
    identity: new CssVector([0, 0, 0]),
    combine: (parent: CssVector, input: CssVector) => parent.add(input),
  };
  expect(
    () =>
      new Accumulator({ ...composite, combine: () => new CssVector([0, 0]) }),
  ).toThrow(TypeError);
  expect(() => new Accumulator({ ...composite, syntax: "<length>" })).toThrow(
    TypeError,
  );
  expect(
    () =>
      new Accumulator({
        ...composite,
        start: new CssVector([0, 0]),
        combine: () => new CssVector([0, 0, 0]),
      }),
  ).toThrow(TypeError);
  expect(rules()).toBe(before);
});

it("frees every component on dispose and guards generated names", () => {
  using s = scene();
  const before = rules();
  const target = group(s.root);
  const first = turnings("x");
  first.addTarget(target);
  expect(() => sum("x-0")).toThrow(RangeError);
  expect(() => sum("x-5")).toThrow(RangeError);
  first[Symbol.dispose]();
  expect(rules()).toBe(before);
  expect(target.domElement.style.getPropertyValue("--x-8-input")).toBe("");
  using scalar = sum("x-0");
  expect(chained(scalar, target)).toBe(false);
});

it("normalizes a zero vector to zero", () => {
  using s = scene();
  using acc = vectors("unit", (node) =>
    node instanceof Camera ? null : new CssVector([0, 0, 0]).normalize(),
  );
  const target = group(s.root);
  acc.addTarget(target);
  expect(components(target, "unit", 3)).toEqual([0, 0, 0]);
});
