import { expect, it } from "vitest";
import { commands, page, server } from "vitest/browser";
import pixelmatch from "pixelmatch";
import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { C3RRenderer } from "../src/C3RRenderer.js";

const WIDTH = 400;
const HEIGHT = 300;
// Compared downscaled, as WebGL mipmaps the texture but CSS doesn't
const SCALE = 4;
const LIMIT = 0.02; // measured 0.0105

// From examples/three_geometry_earth.html, without animation
async function earthScene() {
  const scene = new Scene();
  scene.background = new Color(0xffffff);

  const group = new Group();
  group.rotation.y = 1;
  scene.add(group);

  const map = await new TextureLoader().loadAsync(
    "/textures/land_ocean_ice_cloud_2048.jpg",
  );
  map.colorSpace = SRGBColorSpace;
  group.add(
    new Mesh(new SphereGeometry(200, 16, 10), new MeshBasicMaterial({ map })),
  );

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.1, "rgba(210,210,210,1)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const shadow = new CanvasTexture(canvas);
  shadow.colorSpace = SRGBColorSpace;
  const plane = new Mesh(
    new PlaneGeometry(300, 300, 2, 2),
    new MeshBasicMaterial({ map: shadow }),
  );
  plane.position.y = -250;
  plane.rotation.x = -Math.PI / 2;
  group.add(plane);

  const camera = new PerspectiveCamera(60, WIDTH / HEIGHT, 1, 2000);
  camera.position.set(150, 100, 500);
  camera.lookAt(scene.position);

  return { scene, camera };
}

const W = WIDTH / SCALE;
const H = HEIGHT / SCALE;

const canvas2d = () => {
  const context = document.createElement("canvas").getContext("2d")!;
  context.canvas.width = W;
  context.canvas.height = H;
  return context;
};

// Also saved to __screenshots__/ for inspection
async function pixels(element: Element, name: string) {
  const { base64 } = await page.screenshot({
    element,
    path: `__screenshots__/${name}.png`,
    base64: true,
  });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  expect([image.width, image.height]).toEqual([WIDTH, HEIGHT]);

  const context = canvas2d();
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, W, H);
  return context.getImageData(0, 0, W, H);
}

// Firefox misorders a polygon cut by an earlier one's plane under perspective,
// which this camera hits, and Playwright's WebKit is not Safari
const chromiumOnly = it.skipIf(server.browser !== "chromium");

chromiumOnly("renders the earth example like WebGLRenderer", async () => {
  const { scene, camera } = await earthScene();
  document.body.style.cssText = "margin:0;background:#fff";

  const webgl = new WebGLRenderer({ antialias: true });
  webgl.setPixelRatio(1);
  webgl.setSize(WIDTH, HEIGHT);
  document.body.appendChild(webgl.domElement);

  const c3r = new C3RRenderer();
  c3r.setSize(WIDTH, HEIGHT);
  document.body.appendChild(c3r.domElement);

  webgl.render(scene, camera);
  c3r.render(scene, camera);
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );

  const expected = await pixels(webgl.domElement, "earth-webgl");
  const actual = await pixels(c3r.domElement, "earth-c3r");
  const diff = new ImageData(W, H);
  const ratio =
    pixelmatch(expected.data, actual.data, diff.data, W, H, {
      threshold: 0.1,
    }) /
    (W * H);

  if (ratio >= LIMIT) {
    const context = canvas2d();
    context.putImageData(diff, 0, 0);
    const png = context.canvas.toDataURL().split(",")[1];
    await commands.writeFile(
      "packages/c3r-three/test/__screenshots__/earth-diff.png",
      png,
      "base64",
    );
  }
  expect(ratio).toBeLessThan(LIMIT);
});

it("tints a sprite's map by its color", () => {
  const canvas = canvas2d().canvas;
  const scene = new Scene();
  scene.add(
    new Sprite(
      new SpriteMaterial({ map: new CanvasTexture(canvas), color: 0xff0000 }),
    ),
  );
  const c3r = new C3RRenderer();
  c3r.setSize(WIDTH, HEIGHT);
  document.body.appendChild(c3r.domElement);
  c3r.render(scene, new PerspectiveCamera());
  const sprite = c3r.domElement.querySelector(".c3r-element")!;
  const { backgroundImage, maskImage } = getComputedStyle(sprite);
  expect(backgroundImage).toMatch(/^linear-gradient\(rgb\(255, 0, 0\)/);
  expect(maskImage).toMatch(/^url\("data:/);
  c3r.domElement.remove();
});
