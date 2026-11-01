import { expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  Container,
  ElementObject,
  Group,
  type Lights,
  Material,
  OrthographicCamera,
  type Polygon,
  Transform,
  Tween,
  type Vertex,
} from "c3r";
import { mat3, type ReadonlyMat4, vec3, type ReadonlyVec3 } from "gl-matrix";
import { cube } from "primitive-geometry";
import { composeTransforms } from "../src/css/Transform.js";

const SQUARE: Vertex[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
].map(([x, y]) => ({ position: [x, y, 0], uv: [x, y] }));

// Toward +z, so the shade reads as the z of the world normal
const TOP: Lights = { directional: { direction: [0, 0, -1], intensity: 1 } };

const scene = (lights: Lights | null = TOP) => {
  const container = new Container();
  document.body.append(container.domElement);
  container.setSize(100, 100);
  container.lights = lights;
  container.root.material = new Material();
  container.root.material.shading = "flat";
  return {
    container,
    root: container.root,
    [Symbol.dispose]: () => container.domElement.remove(),
  };
};

const shadeOf = (polygon: Polygon) =>
  Number(
    getComputedStyle(polygon.contentElement).getPropertyValue("--c3r-shade"),
  );

const normalOf = (vertices: readonly Vertex[]) => {
  const n = vec3.create();
  vertices.forEach(({ position }, i) => {
    const next = vertices[(i + 1) % vertices.length].position;
    vec3.add(n, n, vec3.cross(vec3.create(), position, next));
  });
  return vec3.normalize(n, n);
};

const lambert = (
  m: ReadonlyMat4,
  normal: ReadonlyVec3,
  toLight: ReadonlyVec3,
): number => {
  const world = vec3.transformMat3(
    vec3.create(),
    normal,
    mat3.normalFromMat4(mat3.create(), m)!,
  );
  vec3.normalize(world, world);
  return Math.max(0, vec3.dot(world, toLight));
};

const flush = () => new Promise((resolve) => requestAnimationFrame(resolve));

it("shades every fit path by its outward normal", async () => {
  const direction: ReadonlyVec3 = [-1, -2, -3];
  using s = scene({
    ambient: { intensity: 0.1 },
    directional: { direction, intensity: 0.7 },
  });
  const pose = [
    Transform.rotateX(0.7),
    Transform.scale(2),
    Transform.rotateY(-0.4),
    Transform.translate([1, 2, 3]),
  ];
  const group = new Group();
  s.root.addChild(group);
  group.transform = pose;
  const polygons = [
    ...group.addMesh(cube({ sx: 2 })),
    group.addPolygon(SQUARE.slice(0, 3)),
    group.addPolygon(
      [
        [0, 0, 1],
        [2, 0, 1],
        [2, 1, 1],
        [1, 1, 1],
        [1, 2, 1],
        [0, 2, 1],
      ].map((position) => ({ position, uv: [0, 0] })),
    ),
  ];
  await s.container.bake();
  const toLight = vec3.normalize(
    vec3.create(),
    vec3.negate([0, 0, 0], direction),
  );
  for (const polygon of polygons) {
    const normal = normalOf(polygon.vertices);
    const expected =
      0.1 + 0.7 * lambert(composeTransforms(pose), normal, toLight);
    expect(shadeOf(polygon)).toBeCloseTo(expected, 3);
  }
});

it("keeps the right faces lit under a scale that isn't uniform", async () => {
  using s = scene({
    ambient: { intensity: 0.1 },
    directional: { direction: [0, -1, 0], intensity: 0.5 },
  });
  const group = new Group();
  s.root.addChild(group);
  group.transform = Transform.scale([1, 3, 1]);
  const polygons = group.addMesh(cube({ sx: 2 }));
  await s.container.bake();
  for (const polygon of polygons) {
    if (normalOf(polygon.vertices)[1] > 0.5)
      expect(shadeOf(polygon)).toBeGreaterThan(0.1);
    else expect(shadeOf(polygon)).toBeCloseTo(0.1, 4);
  }
});

it("ignores the camera and follows the root", async () => {
  using s = scene();
  const polygon = s.root.addPolygon(SQUARE);
  await s.container.bake();
  s.container.camera.transform = [
    Transform.rotateY(1),
    Transform.translate([0, 0, 5]),
  ];
  expect(shadeOf(polygon)).toBeCloseTo(1, 4);
  s.root.transform = Transform.rotateX(1);
  expect(shadeOf(polygon)).toBeCloseTo(Math.cos(1), 4);
});

it("follows tweens at their animated values", async () => {
  using s = scene();
  const outer = new Group();
  s.root.addChild(outer);
  outer.transform = Transform.rotateZ(0.3);
  const spin = new Group();
  outer.addChild(spin);
  spin.transform = Transform.rotateY(0.2);
  const polygon = spin.addPolygon(SQUARE);
  // Half way through, a broken animation would read the from values
  const halfway = { duration: 1, delay: -0.5, paused: true };
  const turn = new Tween({
    ...halfway,
    from: [
      Transform.translate([0, 0, 0]),
      Transform.rotateX(0),
      Transform.rotateY(0),
      Transform.scale(1),
    ],
    keyframes: [
      [
        Transform.translate([3, 0, 0]),
        Transform.rotateX(1.2),
        Transform.rotateY(0.8),
        Transform.scale(3),
      ],
    ],
  });
  const roll = new Tween({
    ...halfway,
    from: Transform.rotateX(0),
    keyframes: [Transform.rotateX(0.6)],
  });
  spin.tween = [turn, roll];
  await s.container.bake();
  await flush();
  const half = [
    Transform.rotateX(0.6),
    Transform.rotateY(0.4),
    Transform.scale(2),
  ];
  const expected = (...below: Transform[]) =>
    lambert(
      composeTransforms([
        Transform.rotateZ(0.3),
        Transform.rotateY(0.2),
        ...below,
      ]),
      [0, 0, 1],
      [0, 0, 1],
    );
  expect(shadeOf(polygon)).toBeCloseTo(
    expected(...half, Transform.rotateX(0.3)),
    3,
  );

  roll[Symbol.dispose]();
  await flush();
  expect(shadeOf(polygon)).toBeCloseTo(expected(...half), 3);
});

it("applies at bake, to the polygons a material reaches", async () => {
  using s = scene();
  s.root.material = null;
  const flat = new Group();
  s.root.addChild(flat);
  flat.material = new Material();
  flat.material.shading = "flat";
  const shaded = flat.addPolygon(SQUARE);
  const plainBranch = new Group();
  s.root.addChild(plainBranch);
  const plain = plainBranch.addPolygon(SQUARE);
  await s.container.bake();

  const chained = (element: Element) =>
    /c3r-accumulator-/.test(element.className);
  const image = (polygon: Polygon) =>
    getComputedStyle(polygon.contentElement).backgroundImage;
  expect(image(shaded)).toContain("gradient");
  expect(image(plain)).not.toContain("gradient");
  expect(chained(plainBranch.domElement)).toBe(false);

  const inner = new Container();
  const nested = inner.root.addPolygon(SQUARE);
  const { contentElement } = flat.addPolygon(SQUARE);
  contentElement.append(inner.domElement);
  await s.container.bake();
  expect(image(nested)).not.toContain("gradient");

  flat.material.shading = null;
  await s.container.bake();
  expect(image(shaded)).not.toContain("gradient");
  expect(chained(flat.domElement)).toBe(false);
});

it("reads each container's own lights, and is black without any", async () => {
  using a = scene({ ambient: { intensity: 0.25 } });
  using b = scene({ ambient: { intensity: 0.5 }, ...TOP });
  const polygons = [a, b].map((s) => s.root.addPolygon(SQUARE));
  await Promise.all([a, b].map((s) => s.container.bake()));
  expect(polygons.map(shadeOf)).toEqual([0.25, 1]);

  a.container.lights = null;
  expect(shadeOf(polygons[0])).toBe(0);

  const nested = new Container();
  nested.root.material = new Material();
  nested.root.material.shading = "flat";
  const inner = nested.root.addPolygon(SQUARE);
  b.root.addChild(new ElementObject(nested.domElement));
  await nested.bake();
  expect(shadeOf(inner)).toBe(0);
});

it("refuses invalid lights and shading", () => {
  using s = scene();
  const before = s.container.domElement.style.cssText;
  for (const bad of [
    { ambient: { intensity: -1 } },
    { directional: { direction: [0, 0, 0], intensity: 1 } },
    { directional: { direction: [0, NaN, 0], intensity: 1 } },
    { directional: { direction: [0, 1, 0], intensity: Infinity } },
  ])
    expect(() => (s.container.lights = bad)).toThrow(RangeError);
  expect(s.container.domElement.style.cssText).toBe(before);
  expect(() => (new Material().shading = "smooth" as "flat")).toThrow(
    RangeError,
  );
});

const centerColor = async (element: Element) => {
  const { base64 } = await page.screenshot({ element, base64: true });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const context = document.createElement("canvas").getContext("2d")!;
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
};

const imageOf = async (fill: string | null) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 8;
  const context = canvas.getContext("2d")!;
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, 8, 8);
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve),
  );
  return URL.createObjectURL(blob!);
};

const paint = async (background: Material["background"]) => {
  const s = scene({ ambient: { intensity: 0.5 } });
  s.container.camera = new OrthographicCamera(0, 1, 1, 0);
  s.root.material!.background = background;
  s.root.addPolygon(SQUARE);
  await s.container.bake();
  await flush();
  return s;
};

// Half the light once sRGB encoded
const ENCODED_HALF = 0.7354;

it("multiplies a color or an opaque image by the linear light", async () => {
  const rgb = [128, 200, 64];
  for (const background of [
    rgb.map((c) => c / 255).concat(1) as [number, number, number, number],
    await imageOf(`rgb(${rgb})`),
  ]) {
    using s = await paint(background);
    const color = await centerColor(s.container.domElement);
    rgb.forEach((c, i) =>
      expect(Math.abs(color[i] - c * ENCODED_HALF)).toBeLessThanOrEqual(2),
    );
  }
});

it("leaves transparent texels transparent", async () => {
  using s = await paint(await imageOf(null));
  expect(await centerColor(s.container.domElement)).toEqual([255, 255, 255]);
});
