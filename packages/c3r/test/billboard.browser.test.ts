import { expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import {
  Billboard,
  Container,
  Group,
  type Object3D,
  PerspectiveCamera,
  Transform,
  Tween,
} from "c3r";

// Halfway through, held still
const half = { duration: 2, delay: -1, paused: true };

// The view's own flip stays
const facing = [1, 0, 0, 0, -1, 0, 0, 0, 1];

const matrix = (element: Element) =>
  new DOMMatrix(getComputedStyle(element).transform);

const product = (elements: Element[]) =>
  elements.reduce((m, e) => m.multiply(matrix(e)), new DOMMatrix());

const linear = (m: DOMMatrix) =>
  [m.m11, m.m12, m.m13, m.m21, m.m22, m.m23, m.m31, m.m32, m.m33].map(
    (v) => +v.toFixed(4) + 0,
  );

const chain = (obj: Object3D, container: Container) => {
  const elements: Element[] = [];
  for (
    let e: Element | null = obj.domElement;
    e && e !== container.domElement;
    e = e.parentElement
  )
    elements.unshift(e);
  return elements;
};

// The linear part of everything that turns it, from the view down
const faces = (obj: Object3D, container: Container) =>
  linear(product(chain(obj, container)));

const facingInput = (obj: Object3D) =>
  obj.domElement.style.getPropertyValue("--c3r-facing-input");

const scene = (parentTransform: Transform[]) => {
  const container = new Container();
  document.body.append(container.domElement);
  container.camera.transform = [
    Transform.rotateY(0.3),
    Transform.translate([0, 0, 400]),
  ];
  const cameraTween = new Tween({
    keyframes: [Transform.rotateX(0.8)],
    ...half,
  });
  container.camera.tween = cameraTween;
  const grand = new Group();
  container.root.addChild(grand);
  const grandTween = new Tween({ keyframes: [Transform.rotateY(1)], ...half });
  grand.tween = grandTween;
  const parent = new Group();
  grand.addChild(parent);
  parent.transform = parentTransform;
  const own = [Transform.translate([10, 20, 5]), Transform.rotateZ(0.7)];
  const billboard = new Billboard();
  parent.addChild(billboard);
  billboard.transform = own;
  const ownTween = new Tween({ keyframes: [Transform.rotateX(1.2)], ...half });
  billboard.tween = ownTween;
  const plain = new Group();
  parent.addChild(plain);
  plain.transform = own;
  return {
    container,
    grand,
    parent,
    billboard,
    plain,
    [Symbol.dispose]: () => {
      container.domElement.remove();
      for (const t of [cameraTween, grandTween, ownTween]) t[Symbol.dispose]();
    },
  };
};

it("cancels every rotation and mirror above it, nested too", () => {
  using s = scene([
    Transform.scale([-1, 1, 1]),
    Transform.rotateX(0.5),
    Transform.translate([30, 0, 0]),
    Transform.rotateZ(0.2),
  ]);
  expect(faces(s.billboard, s.container)).toEqual(facing);
  // Turning in place keeps it where a plain group would be
  const at = (obj: Object3D) => {
    const m = product(chain(obj, s.container).slice(1));
    return [m.m41, m.m42, m.m43].map((v) => +v.toFixed(3) + 0);
  };
  expect(at(s.billboard)).toEqual(at(s.plain));

  const turned = new Group();
  s.billboard.addChild(turned);
  turned.transform = Transform.rotateY(0.9);
  const inner = new Billboard();
  turned.addChild(inner);
  expect(faces(inner, s.container)).toEqual(facing);
});

it("counters several tweens on a group and on the camera in order", () => {
  using s = scene([Transform.rotateX(0.5)]);
  using a = new Tween({ keyframes: [Transform.rotateY(1)], ...half });
  using b = new Tween({ keyframes: [Transform.rotateX(0.6)], ...half });
  using c = new Tween({ keyframes: [Transform.rotateX(0.8)], ...half });
  using d = new Tween({ keyframes: [Transform.rotateZ(0.5)], ...half });
  s.grand.tween = [a, b];
  s.container.camera.tween = [c, d];
  expect(faces(s.billboard, s.container)).toEqual(facing);
});

it("ignores a disposed camera", () => {
  new Billboard();
  const camera = new PerspectiveCamera();
  using tween = new Tween({ keyframes: [Transform.rotateX(0.8)], ...half });
  camera[Symbol.dispose]();
  expect(() => {
    camera.transform = Transform.rotateY(1);
    camera.tween = tween;
  }).not.toThrow();
});

it("counters a mirror and a matrix tween with plain transform functions", () => {
  using s = scene([Transform.scale([-1, 1, 1])]);
  using spin = new Tween({
    keyframes: [Transform.matrix(mat4.fromZRotation(mat4.create(), 1))],
    ...half,
  });
  s.parent.tween = spin;
  expect(facingInput(s.parent)).toBe(
    `var(--${spin.className}-matrix-rotate-y, rotate3d(0,0,1,0rad)) scale3d(-1,1,1) rotate3d(0,0,1,0rad)`,
  );
});
