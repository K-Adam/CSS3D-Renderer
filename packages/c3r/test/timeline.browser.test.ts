import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  Container,
  Group,
  Material,
  Timeline,
  Transform,
  Tween,
  type Vertex,
} from "c3r";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const floor = (size: number): Vertex[] =>
  [
    [-size, 0, size],
    [size, 0, size],
    [size, 0, -size],
    [-size, 0, -size],
  ].map(([x, y, z]) => ({ position: [x, y, z], uv: [0, 0] }));

const timeOf = (element: Element) =>
  element.getAnimations().find((a) => a.currentTime !== null)!
    .currentTime as number;

it("starts tweens on one timeline together at a bake, and pauses them and their shadows together", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  container.camera.transform = Transform.translate([0, 200, 400]);
  const motion = new Timeline();
  const slide = () =>
    new Tween({
      keyframes: [Transform.translate([40, 0, 0])],
      duration: 2,
      loop: true,
      alternate: true,
      timeline: motion,
    });
  container.lights = {
    point: { position: [0, 150, 0], intensity: 20000, tween: slide() },
  };
  const ground = container.root.addPolygon(floor(200));
  ground.material = new Material();
  ground.material.shadows = { opacity: 0.5 };
  const caster = new Group();
  container.root.addChild(caster);
  caster.transform = Transform.translate([0, 50, 0]);
  caster.shadowCaster = { shape: "box", size: [20, 20, 20] };
  await wait(300);
  // Joins a timeline that has been running for a while
  caster.tween = slide();
  await container.bake({ shadows: true });

  const layer = ground.domElement.querySelector(".c3r-shadow > div")!;
  const times = () =>
    [container.domElement, caster.domElement, layer].map(timeOf);
  const [light, group, shadow] = times();
  expect(Math.abs(group - light)).toBeLessThan(50);
  expect(Math.abs(shadow - light)).toBeLessThan(50);

  motion.paused = true;
  await wait(50);
  const held = times();
  await wait(200);
  expect(times()).toEqual(held);
  container.domElement.remove();
});

it("keeps a running tween's time when one earlier in the page joins its timeline", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  const motion = new Timeline();
  const slide = () =>
    new Tween({
      keyframes: [Transform.translate([40, 0, 0])],
      duration: 2,
      loop: true,
      timeline: motion,
    });
  const [first, second] = [new Group(), new Group()];
  container.root.addChild(first);
  container.root.addChild(second);
  second.tween = slide();
  await container.bake();
  await wait(300);
  first.tween = slide();
  await container.bake();
  const [a, b] = [first, second].map((g) => timeOf(g.domElement));
  expect(b).toBeGreaterThan(250);
  expect(Math.abs(a - b)).toBeLessThan(50);
  container.domElement.remove();
});

it("plays a hover timeline while one of its groups is hovered", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  container.camera.transform = Transform.translate([0, 0, 400]);
  const hover = new Timeline({ hover: true });
  const pulse = () =>
    new Tween({
      keyframes: [Transform.scale(1.2)],
      loop: true,
      alternate: true,
      timeline: hover,
    });
  const [hovered, other] = [new Group(), new Group()];
  for (const group of [hovered, other]) {
    container.root.addChild(group);
    group.tween = pulse();
  }
  other.transform = Transform.translate([300, 0, 0]);
  const face = hovered.addPolygon(
    [
      [-100, -100],
      [100, -100],
      [100, 100],
      [-100, 100],
    ].map(([x, y]) => ({ position: [x, y, 0], uv: [0, 0] })),
  );
  await container.bake();
  const state = (g: Group) => getComputedStyle(g.domElement).animationPlayState;
  expect([state(hovered), state(other)]).toEqual(["paused", "paused"]);
  await userEvent.hover(face.domElement);
  expect([state(hovered), state(other)]).toEqual(["running", "running"]);
  container.domElement.remove();
});

it("brings a group added after a bake in step with its timeline", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  const motion = new Timeline();
  const slide = () =>
    new Tween({
      keyframes: [Transform.translate([40, 0, 0])],
      duration: 2,
      loop: true,
      timeline: motion,
    });
  const [running, late] = [new Group(), new Group()];
  container.root.addChild(running);
  running.tween = slide();
  late.tween = slide();
  await container.bake();
  await wait(300);
  container.root.addChild(late);
  await container.bake();
  const [a, b] = [running, late].map((g) => timeOf(g.domElement));
  expect(a).toBeGreaterThan(250);
  expect(Math.abs(a - b)).toBeLessThan(50);
  container.domElement.remove();
});

it("keeps a shadow in step when its receiver moves in the scene", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  // On the container, which stays in the document whatever moves inside it
  container.lights = {
    point: {
      position: [0, 150, 0],
      intensity: 20000,
      tween: new Tween({
        keyframes: [Transform.translate([40, 0, 0])],
        duration: 2,
        loop: true,
        timeline: new Timeline(),
      }),
    },
  };
  const caster = new Group();
  container.root.addChild(caster);
  caster.transform = Transform.translate([0, 50, 0]);
  caster.shadowCaster = { shape: "box", size: [20, 20, 20] };
  const holder = new Group();
  container.root.addChild(holder);
  const ground = holder.addPolygon(floor(200));
  ground.material = new Material();
  ground.material.shadows = { opacity: 0.5 };
  await container.bake({ shadows: true });
  const layer = ground.domElement.querySelector(".c3r-shadow > div")!;
  const apart = () => Math.abs(timeOf(layer) - timeOf(container.domElement));
  await wait(300);
  container.root.addChild(holder);
  await container.bake();
  expect(apart()).toBeLessThan(50);
  // A root swapped out and back is put in the document again too
  await wait(300);
  const root = container.root;
  container.root = new Group();
  container.root = root;
  await container.bake();
  expect(apart()).toBeLessThan(50);
  container.domElement.remove();
});

it("brings a container baked before it was shown in step with its timeline", async () => {
  const motion = new Timeline();
  const lit = () => {
    const container = new Container();
    container.lights = {
      point: {
        position: [0, 150, 0],
        intensity: 1,
        tween: new Tween({
          keyframes: [Transform.translate([40, 0, 0])],
          duration: 2,
          loop: true,
          timeline: motion,
        }),
      },
    };
    return container;
  };
  const shown = lit();
  document.body.append(shown.domElement);
  await shown.bake();
  await wait(300);
  const late = lit();
  await late.bake();
  document.body.append(late.domElement);
  await late.bake();
  const [a, b] = [shown, late].map((c) => timeOf(c.domElement));
  expect(a).toBeGreaterThan(250);
  expect(Math.abs(a - b)).toBeLessThan(50);
  shown.domElement.remove();
  late.domElement.remove();
});
