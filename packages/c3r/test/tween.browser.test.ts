import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { mat4 } from "gl-matrix";
import {
  Container,
  cssText,
  Filter,
  Group,
  Material,
  Transform,
  Tween,
} from "c3r";

const turn = 2 * Math.PI;
// Halfway through, held still
const half = { duration: 2, delay: -1, paused: true };

// A 200px square facing the camera at the center of the view
const square = (parent: Group) =>
  parent.addPolygon(
    [
      [-100, -100],
      [100, -100],
      [100, 100],
      [-100, 100],
    ].map(([x, y]) => ({ position: [x, y, 0], uv: [0, 0] })),
  );

const scene = () => {
  const container = new Container();
  document.body.append(container.domElement);
  container.camera.matrix = mat4.fromTranslation(mat4.create(), [0, 0, 400]);
  const group = new Group();
  container.root.addChild(group);
  return {
    container,
    group,
    face: square(group),
    [Symbol.dispose]: () => container.domElement.remove(),
  };
};

const transform = (element: Element) => {
  const m = new DOMMatrix(getComputedStyle(element).transform);
  return [m.m11, m.m22, m.m41].map((v) => +v.toFixed(6));
};

it("composes the tween after the matrix, past a half turn", () => {
  using s = scene();
  s.group.matrix = mat4.fromTranslation(mat4.create(), [100, 0, 0]);
  using tween = new Tween({ keyframes: [Transform.rotateZ(turn)], ...half });
  s.group.tween = tween;
  expect(transform(s.group.domElement)).toEqual([-1, -1, 100]);
});

it("holds the previous keyframe's steps", () => {
  using s = scene();
  using tween = new Tween({
    keyframes: [Transform.translate([50, 0, 0]), Transform.rotateZ(turn)],
    duration: 1,
    delay: -1.5,
    paused: true,
  });
  s.group.tween = tween;
  expect(transform(s.group.domElement)).toEqual([-1, -1, 50]);
});

it("keeps the matrix and the other tweens when one is disposed", () => {
  using s = scene();
  s.group.matrix = mat4.fromTranslation(mat4.create(), [100, 0, 0]);
  using spin = new Tween({ keyframes: [Transform.rotateZ(turn)], ...half });
  const tint = new Tween({ keyframes: [Filter.sepia(1)], ...half });
  using fade = new Tween({ keyframes: [Filter.opacity(0)], ...half });
  s.group.tween = [spin, tint, fade];

  tint[Symbol.dispose]();
  expect(getComputedStyle(s.face.domElement).filter).toBe(
    "sepia(0) opacity(0.5)",
  );
  spin[Symbol.dispose]();
  expect(transform(s.group.domElement)).toEqual([1, 1, 100]);
  expect(s.group.domElement.getAnimations()).toHaveLength(1);
});

it("moves the camera after its matrix", () => {
  using s = scene();
  using move = new Tween({
    keyframes: [[Transform.translate([100, 20, 50]), Transform.rotateY(1)]],
    ...half,
  });
  using grow = new Tween({
    keyframes: [Transform.scale([2, 1, 0.5])],
    ...half,
  });
  s.container.camera.tween = [move, grow];

  using still = scene();
  const world = mat4.clone(s.container.camera.matrix);
  mat4.translate(world, world, [50, 10, 25]);
  mat4.rotateY(world, world, 0.5);
  mat4.scale(world, world, [1.5, 1, 0.75]);
  still.container.camera.matrix = world;

  const view = (c: Container) =>
    Array.from(
      new DOMMatrix(getComputedStyle(c.viewElement).transform).toFloat64Array(),
      (v) => +v.toFixed(2) + 0,
    );
  expect(view(s.container)).toEqual(view(still.container));
});

it("rests a hover transition at `from`, also when assigned later", () => {
  using s = scene();
  using fade = new Tween({
    from: Filter.opacity(0.5),
    keyframes: [Filter.opacity(1)],
    duration: 100,
    hover: true,
  });
  const filter = () => getComputedStyle(s.face.domElement).filter;
  expect(filter()).toBe("none");
  s.group.tween = fade;
  expect(filter()).toBe("opacity(0.5)");
});

it("keeps a hover transition when another one is disposed", () => {
  using s = scene();
  using fade = new Tween({ keyframes: [Filter.opacity(0)], hover: true });
  const tint = new Tween({ keyframes: [Filter.sepia(1)], hover: true });
  s.group.tween = [fade, tint];
  tint[Symbol.dispose]();

  const style = getComputedStyle(s.group.domElement);
  const properties = style.transitionProperty.split(", ");
  // The last matching entry wins, and "all" matches every property
  const last = properties.findLastIndex(
    (p) => p === `--${fade.className}-opacity` || p === "all",
  );
  expect(style.transitionDuration.split(", ")[last]).toBe("1s");
});

it("plays only while hovered, unless paused", async () => {
  using s = scene();
  using tween = new Tween({
    keyframes: [Transform.scale(2)],
    loop: true,
    hover: true,
  });
  s.group.tween = tween;
  const playState = () =>
    getComputedStyle(s.group.domElement).animationPlayState;

  expect(playState()).toBe("paused");
  await userEvent.hover(s.face.domElement);
  expect(playState()).toBe("running");
  tween.paused = true;
  expect(playState()).toBe("paused");
});

it("filters the polygons, keeping the group 3D", () => {
  using s = scene();
  s.group.material = new Material();
  s.group.material.filter = Filter.opacity(0.5);
  using tween = new Tween({
    keyframes: [[Filter.opacity(0), Filter.brightness(2)]],
    ...half,
  });
  s.group.tween = tween;

  const { opacity, filter } = getComputedStyle(s.face.domElement);
  expect([opacity, filter]).toEqual([
    "1",
    "opacity(0.5) opacity(0.5) brightness(1.5)",
  ]);
  expect(getComputedStyle(s.group.domElement).filter).toBe("none");
  const plain = square(s.container.root);
  expect(getComputedStyle(plain.domElement).filter).toBe("none");
  expect(() => (s.group.material!.filter = {} as Filter)).toThrow(TypeError);
});

it("eases to its end while hovered and back on leave, unless paused", async () => {
  using s = scene();
  const opacity = () =>
    +/opacity\((.*)\)/.exec(getComputedStyle(s.face.domElement).filter)![1];
  using tween = new Tween({
    keyframes: [Filter.opacity(0.5)],
    duration: 100,
    delay: -50,
    hover: true,
  });
  s.group.tween = tween;

  expect(opacity()).toBe(1);
  await userEvent.hover(s.face.domElement);
  expect(opacity()).toBeCloseTo(0.75, 2);
  // unhover() moves to the body's center, still over the face
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } });
  const left = opacity();
  expect(left).toBeGreaterThan(0.75);
  expect(left).toBeLessThan(1);

  tween.paused = true;
  await userEvent.hover(s.face.domElement);
  expect(opacity()).toBeGreaterThanOrEqual(left);
});

it("runs several tweens on one group, chaining their filters", async () => {
  using s = scene();
  using spin = new Tween({ keyframes: [Transform.rotateZ(turn)], ...half });
  using tint = new Tween({ keyframes: [Filter.sepia(1)], ...half });
  using fade = new Tween({
    keyframes: [Filter.opacity(0.5)],
    duration: 0.01,
    hover: true,
  });
  s.group.tween = [spin, tint, fade];

  expect(transform(s.group.domElement)).toEqual([-1, -1, 0]);
  const filter = () => getComputedStyle(s.face.domElement).filter;
  expect(filter()).toBe("sepia(0.5) opacity(1)");
  await userEvent.hover(s.face.domElement);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(filter()).toBe("sepia(0.5) opacity(0.5)");
});

it("masks only a tinted image to its alpha, also an inherited one", () => {
  using s = scene();
  const paint = (face: { contentElement: Element }) => {
    const { backgroundColor, maskImage } = getComputedStyle(
      face.contentElement,
    );
    return [backgroundColor, maskImage.replace(/url\(".*\//, 'url("')];
  };
  const image = square(s.container.root);
  image.material = new Material();
  image.material.backgroundImageSrc = "leaf.png";
  const tinted = square(s.container.root);
  tinted.material = new Material();
  tinted.material.backgroundColor = [1, 0, 0, 1];
  tinted.material.backgroundImageSrc = "leaf.png";
  const leaf = new Group();
  s.container.root.addChild(leaf);
  leaf.material = new Material();
  leaf.material.backgroundImageSrc = "leaf.png";
  const inherited = square(leaf);
  inherited.material = new Material();
  inherited.material.backgroundColor = [1, 0, 0, 1];

  expect(paint(s.face)).toEqual(["rgb(255, 255, 255)", "none"]);
  expect(paint(image)).toEqual(["rgba(0, 0, 0, 0)", "none"]);
  expect(paint(tinted)).toEqual(["rgb(255, 0, 0)", 'url("leaf.png")']);
  expect(paint(inherited)).toEqual(["rgb(255, 0, 0)", 'url("leaf.png")']);
});

it("rejects an easing that CSS would drop, leaving no rules", () => {
  const before = cssText();
  expect(
    () => new Tween({ keyframes: [Transform.scale(2)], easing: "wobble" }),
  ).toThrow(RangeError);
  expect(cssText()).toBe(before);

  const easing = "linear(0, calc(0.5) 50%, 1)";
  new Tween({ keyframes: [Transform.scale(2)], easing })[Symbol.dispose]();
});

it("keeps the rest of the animation after a commented easing", () => {
  using s = scene();
  using tween = new Tween({
    keyframes: [Transform.scale(2)],
    easing: "ease /*",
    loop: true,
  });
  s.group.tween = tween;
  expect(getComputedStyle(s.group.domElement).animationIterationCount).toBe(
    "infinite",
  );
});
