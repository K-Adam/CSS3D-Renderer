import { expect, it, onTestFinished } from "vitest";
import {
  Container,
  ElementObject,
  Group,
  Material,
  Polygon,
  Transform,
} from "c3r";

const image = async (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve),
  );
  return URL.createObjectURL(blob!);
};

const square = (parent: Group) =>
  parent.addPolygon(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([x, y]) => ({ position: [x, y, 0], uv: [x, y] })),
  );

const width = (polygon: Polygon) =>
  polygon.domElement.style.getPropertyValue("--c3r-width");

it("sizes a polygon by its material's image after bake", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  container.root.material = new Material();
  container.root.material.background = await image(64, 32);
  const measured = square(container.root);
  const before = width(measured);
  const explicit = square(container.root);
  explicit.textureSize = [64, 32];

  await container.bake();
  expect(width(measured)).not.toBe(before);
  expect(width(measured)).toBe(width(explicit));
  // Opaque, so a tint needs no mask
  expect(
    getComputedStyle(measured.contentElement).getPropertyValue(
      "--c3r-alpha-mask",
    ),
  ).toBe("none");

  measured.textureSize = [512, 256];
  await container.bake();
  expect(width(measured)).not.toBe(width(explicit));
  container.domElement.remove();
});

it("resolves without a size when the image fails to load", async () => {
  const container = new Container();
  container.root.material = new Material();
  const url = await image(64, 32);
  URL.revokeObjectURL(url);
  container.root.material.background = url;
  const face = square(container.root);
  const before = width(face);
  await container.bake();
  expect(width(face)).toBe(before);
});

it("doesn't size an element's children by its material", async () => {
  const container = new Container();
  const element = new ElementObject(document.createElement("div"));
  container.root.addChild(element);
  element.material = new Material();
  element.material.background = await image(64, 32);
  const face = square(element);
  const before = width(face);
  await container.bake();
  expect(width(face)).toBe(before);
});

const scene = () => {
  const container = new Container();
  container.setSize(400, 400);
  document.body.append(container.domElement);
  onTestFinished(() => container.domElement.remove());
  container.camera.transform = Transform.translate([0, 0, 500]);
  return container;
};

const centered = (parent: Group) =>
  parent.addPolygon(
    [
      [-100, -100],
      [100, -100],
      [100, 100],
      [-100, 100],
    ].map(([x, y]) => ({ position: [x, y, 0], uv: [0, 0] })),
  );

const center = (container: Container) => {
  const { left, top } = container.domElement.getBoundingClientRect();
  return document.elementFromPoint(left + 200, top + 200);
};

const turned = (parent: Group) => {
  const group = new Group();
  group.transform = Transform.rotateY(Math.PI);
  parent.addChild(group);
  return group;
};

it("does not scroll when something inside a polygon takes focus", () => {
  const container = scene();
  const polygon = centered(container.root);
  const input = document.createElement("input");
  input.style.cssText = "position: absolute; left: 3000px; top: 3000px";
  polygon.contentElement.append(input);
  input.focus();
  expect(document.activeElement).toBe(input);
  input.scrollIntoView();

  expect(container.domElement.scrollTop).toBe(0);
  expect(container.domElement.scrollLeft).toBe(0);
  expect(polygon.domElement.scrollTop).toBe(0);
  expect(polygon.domElement.scrollLeft).toBe(0);
});

it("hits a polygon facing the camera under groups turned away", () => {
  const container = scene();
  const { contentElement } = centered(turned(turned(container.root)));
  contentElement.style.pointerEvents = "auto";
  expect(center(container)).toBe(contentElement);
});

it("hits a polygon facing a camera behind the scene", () => {
  const container = scene();
  container.camera.transform = [
    Transform.rotateY(Math.PI),
    Transform.translate([0, 0, 500]),
  ];
  const { contentElement } = centered(turned(container.root));
  contentElement.style.pointerEvents = "auto";
  expect(center(container)).toBe(contentElement);
});

it("culls a back face, unless a material above it is double sided", () => {
  const container = scene();
  const group = new Group();
  container.root.addChild(group);
  const { contentElement } = centered(turned(group));
  contentElement.style.pointerEvents = "auto";
  expect(center(container)).toBe(container.domElement);

  group.material = new Material();
  group.material.doubleSided = true;
  expect(center(container)).toBe(contentElement);
  group.material[Symbol.dispose]();
});

it("hits a polygon's shape on its content, its box on its element", () => {
  const container = scene();
  const triangle = container.root.addPolygon(
    [
      [-150, -100],
      [150, -100],
      [0, 0],
    ].map(([x, y]) => ({ position: [x, y, 0], uv: [0, 0] })),
  );
  const { left, top } = container.domElement.getBoundingClientRect();
  const corner = () => document.elementFromPoint(left + 125, top + 205);

  triangle.contentElement.style.pointerEvents = "auto";
  expect(corner()).toBe(container.domElement);
  triangle.domElement.style.pointerEvents = "auto";
  expect(corner()).toBe(triangle.domElement);
});
