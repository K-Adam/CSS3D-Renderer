import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { Container, Material, OrthographicCamera } from "c3r";

const COLORS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [0, 255, 255],
  [255, 0, 255],
];

// Two by three cells, in reading order
const atlas = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  COLORS.forEach(([r, g, b], i) => {
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.fillRect((i % 2) * 32, Math.floor(i / 2) * 32, 32, 32);
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve),
  );
  return URL.createObjectURL(blob!);
};

const centerColor = async (element: Element) => {
  const { base64 } = await page.screenshot({ element, base64: true });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const context = document.createElement("canvas").getContext("2d")!;
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
};

it("steps through the cells of a flipbook", async () => {
  const container = new Container();
  document.body.append(container.domElement);
  container.setSize(100, 100);
  container.camera = new OrthographicCamera(0, 1, 1, 0);

  const material = new Material();
  material.background = await atlas();
  material.flipbook = { columns: 2, rows: 3, fps: 1 };
  container.root.material = material;
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => ({ position: [x, y, 0], uv: [x, y] }));
  const face = container.root.addPolygon(square);
  const cell = container.root.addPolygon(square);
  cell.textureSize = [32, 32];
  await container.bake();
  const width = (polygon: typeof face) =>
    polygon.domElement.style.getPropertyValue("--c3r-width");
  expect(width(face)).toBe(width(cell));
  container.root.removeChild(cell);

  const [animation] = face.contentElement.getAnimations();
  animation.pause();
  for (const [i, color] of COLORS.entries()) {
    animation.currentTime = i * 1000 + 500;
    expect(await centerColor(container.domElement)).toEqual(color);
  }
  container.domElement.remove();
});
