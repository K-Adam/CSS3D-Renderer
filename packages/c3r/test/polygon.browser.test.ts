import { expect, it } from "vitest";
import { Container, ElementObject, type Group, Material, Polygon } from "c3r";

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
