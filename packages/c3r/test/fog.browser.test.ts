import { expect, it } from "vitest";
import {
  Container,
  Group,
  Material,
  Timeline,
  Transform,
  Tween,
  type Vertex,
} from "c3r";

const SQUARE: Vertex[] = [
  [-50, -50],
  [50, -50],
  [50, 50],
  [-50, 50],
].map(([x, y]) => ({ position: [x, y, 0], uv: [0, 0] }));

it("fogs a material by its depth from the eye, following the camera's tween", async () => {
  const page = document.createElement("div");
  page.style.height = "300vh";
  document.body.append(page);
  const container = new Container();
  document.body.append(container.domElement);
  container.fog = { color: [0, 0, 1], length: 1000 };
  container.camera.transform = Transform.translate([0, 0, 400]);
  container.camera.tween = new Tween({
    keyframes: [Transform.translate([0, 0, -100])],
    timeline: new Timeline({ scroll: true }),
  });
  // Scaled, the depth must stay in world units
  const group = new Group();
  group.transform = [Transform.translate([0, 0, -100]), Transform.scale(2)];
  group.material = new Material();
  group.material.fog = true;
  container.root.addChild(group);
  const square = group.addPolygon(SQUARE);
  await container.bake();
  const fog = square.contentElement.querySelector(".c3r-polygon-fog")!;
  const depth = () =>
    parseFloat(getComputedStyle(fog).getPropertyValue("--c3r-fog-center"));
  const alpha = () =>
    parseFloat(
      getComputedStyle(fog).backgroundImage.match(
        /rgba\([^)]*,\s*([\d.]+)\)/,
      )![1],
    );

  expect(depth()).toBeCloseTo(500, 1);
  expect(alpha()).toBeCloseTo(1 - Math.exp(-0.5), 2);

  scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2);
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(depth()).toBeCloseTo(450, 0);

  group.material.fog = false;
  await container.bake();
  expect(square.contentElement.querySelector(".c3r-polygon-fog")).toBeNull();

  scrollTo(0, 0);
  container.domElement.remove();
  page.remove();
});
