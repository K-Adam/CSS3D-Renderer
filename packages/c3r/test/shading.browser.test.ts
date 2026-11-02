import { expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  Container,
  ElementObject,
  Filter,
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
import { cube, icosphere } from "primitive-geometry";
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
    getComputedStyle(polygon.contentElement, "::before").getPropertyValue(
      "--c3r-shade",
    ),
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
  expect(shadeOf(polygon)).toBeCloseTo(Math.cos(1), 3);
});

it("doesn't change the light under a group for a rotation too small to see", async () => {
  using s = scene();
  const group = new Group();
  s.root.addChild(group);
  group.addPolygon(SQUARE);
  await s.container.bake();
  const light = () =>
    getComputedStyle(group.domElement).getPropertyValue("--c3r-to-light-1");
  const before = light();
  group.transform = Transform.rotateX(1e-5);
  expect(light()).toBe(before);
  group.transform = Transform.rotateX(0.1);
  expect(light()).not.toBe(before);
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
  const overlaid = (polygon: Polygon) =>
    getComputedStyle(polygon.contentElement, "::before").content !== "none";
  expect(overlaid(shaded)).toBe(true);
  expect(overlaid(plain)).toBe(false);
  expect(chained(plainBranch.domElement)).toBe(false);

  const inner = new Container();
  const nested = inner.root.addPolygon(SQUARE);
  const { contentElement } = flat.addPolygon(SQUARE);
  contentElement.append(inner.domElement);
  await s.container.bake();
  expect(overlaid(nested)).toBe(false);

  flat.material.shading = null;
  await s.container.bake();
  expect(overlaid(shaded)).toBe(false);
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
  expect(() => (new Material().shading = "phong" as "flat")).toThrow(
    RangeError,
  );
});

// At world (x, y) under an orthographic camera on the unit square, the view
// flips y
const colorsAt = async (element: Element, points: number[][]) => {
  const { base64 } = await page.screenshot({ element, base64: true });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  return points.map(([x, y]) => [
    ...context
      .getImageData(
        Math.min(x * image.width, image.width - 1),
        Math.min((1 - y) * image.height, image.height - 1),
        1,
        1,
      )
      .data.slice(0, 3),
  ]);
};

const centerColor = async (element: Element) =>
  (await colorsAt(element, [[0.5, 0.5]]))[0];

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

it("shades a stylesheet's background on a custom content element", async () => {
  const sheet = document.createElement("style");
  sheet.textContent =
    ".c3r-polygon .custom-card { background-color: rgb(0 0 255); }";
  document.head.append(sheet);
  using s = scene({ ambient: { intensity: 0.5 } });
  s.container.camera = new OrthographicCamera(0, 1, 1, 0);
  const contentElement = document.createElement("div");
  contentElement.className = "custom-card";
  s.root.addPolygon(SQUARE, { contentElement });
  await s.container.bake();
  await flush();
  const color = await centerColor(s.container.domElement);
  sheet.remove();
  expect(Math.abs(color[2] - 255 * ENCODED_HALF)).toBeLessThanOrEqual(2);
  expect(color[0]).toBeLessThanOrEqual(2);
});

it("masks a partly transparent texel once, tinted or not", async () => {
  const image = await imageOf("rgb(255 0 0 / 0.5)");
  // On black, a white page hides what the overlay's own alpha adds
  const through = (c: number) => 255 * ENCODED_HALF * c * 0.5;
  for (const [filter, expected] of [
    [null, [1, 0.5, 0.5]],
    [Filter.tint([0.5, 0.5, 0.5]), [0.5, 0.25, 0.25]],
  ] as const) {
    using s = scene({ ambient: { intensity: 0.5 } });
    s.container.camera = new OrthographicCamera(0, 1, 1, 0);
    s.root.material!.background = image;
    s.root.material!.filter = filter;
    s.container.domElement.style.background = "black";
    s.root.addPolygon(SQUARE);
    await s.container.bake();
    await flush();
    const color = await centerColor(s.container.domElement);
    expected.forEach((c, i) =>
      expect(Math.abs(color[i] - through(c))).toBeLessThanOrEqual(3),
    );
  }
});

const encode = (s: number) =>
  255 * (s <= 0.0031308 ? 12.92 * s : 1.055 * s ** (1 / 2.4) - 0.055);

const smoothScene = (lights: Lights = TOP) => {
  const s = scene(lights);
  s.container.camera = new OrthographicCamera(0, 1, 1, 0);
  s.root.material!.shading = "smooth";
  return s;
};

const shown = async (s: ReturnType<typeof scene>, points: number[][]) => {
  await s.container.bake();
  await flush();
  const colors = await colorsAt(s.container.domElement, points);
  return colors.map(([red]) => red);
};

const leaning = (x: number, y: number) =>
  vec3.normalize(vec3.create(), [x, y, 1]);

const CORNERS = [
  { position: [0, 0, 0], uv: [0, 0], normal: leaning(-1, -1) },
  { position: [1, 0, 0], uv: [1, 0], normal: leaning(1, -1) },
  { position: [0, 1, 0], uv: [0, 1], normal: leaning(-1, 1) },
];

const SIDE: Lights = {
  directional: { direction: [-0.5, -0.3, -1], intensity: 1 },
};

const litAt = (b: number[]) => {
  const toLight = vec3.normalize(vec3.create(), [0.5, 0.3, 1]);
  const n = vec3.create();
  CORNERS.forEach(({ normal }, i) => vec3.scaleAndAdd(n, n, normal, b[i]));
  return vec3.dot(n, toLight);
};

it("interpolates vertex normals between the corners", async () => {
  using s = smoothScene(SIDE);
  s.root.addPolygon(CORNERS);
  const weights = [
    [0.9, 0.05, 0.05],
    [0.05, 0.9, 0.05],
    [0.05, 0.05, 0.9],
    [1 / 3, 1 / 3, 1 / 3],
  ];
  const colors = await shown(
    s,
    weights.map(([, x, y]) => [x, y]),
  );
  colors.forEach((color, i) =>
    expect(Math.abs(color - encode(litAt(weights[i])))).toBeLessThanOrEqual(2),
  );
});

it("leaks no unshaded color along the edges of a sphere", async () => {
  using s = scene({ ambient: { intensity: 0.25 } });
  s.container.setSize(400, 400);
  // Tiny gaps between polygons can only darken it
  s.container.domElement.style.background = "black";
  s.container.camera.transform = Transform.translate([0, 0, 5]);
  s.root.material!.shading = "smooth";
  s.root.material!.background = [0.25, 0.25, 0.25, 1];
  s.root.addMesh(icosphere({ radius: 1, subdivisions: 2 }));
  const inside = Array.from({ length: 21 }, (_, i) =>
    Array.from({ length: 21 }, (_, j) => [0.4 + i / 100, 0.4 + j / 100]),
  ).flat();
  const colors = await shown(s, inside);
  // A quarter of the light once sRGB encoded, on a quarter gray
  expect(Math.max(...colors)).toBeLessThanOrEqual(37);
  expect(Math.max(...colors)).toBeGreaterThan(25);
});

it("doesn't wrap the image's far edge into a polygon in one tile", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 8;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f00";
  context.fillRect(0, 0, 4, 8);
  context.fillStyle = "#00f";
  context.fillRect(4, 0, 4, 8);
  const image = canvas.toDataURL();
  for (const tile of [0, 1]) {
    using s = smoothScene({ ambient: { intensity: 1 } });
    s.root.material!.background = image;
    s.root.addPolygon(
      SQUARE.map((v) => ({ ...v, uv: [v.uv[0] + tile, v.uv[1]] })),
    );
    const [left, right] = await shown(s, [
      [0.02, 0.5],
      [0.98, 0.5],
    ]);
    expect(left).toBeGreaterThan(240);
    expect(right).toBeLessThan(15);
  }
});

it("clamps at the terminator, not at the vertices", async () => {
  using s = smoothScene({
    ambient: { intensity: 0.2 },
    directional: { direction: [-1, 0, 0], intensity: 0.8 },
  });
  s.root.addPolygon([
    { position: [0, 0, 0], uv: [0, 0], normal: [-1, 0, 0] },
    { position: [1, 0, 0], uv: [1, 0], normal: [1, 0, 0] },
    { position: [1, 1, 0], uv: [1, 1], normal: [1, 0, 0] },
    { position: [0, 1, 0], uv: [0, 1], normal: [-1, 0, 0] },
  ]);
  const colors = await shown(s, [
    [0.25, 0.5],
    [0.75, 0.5],
    [0.95, 0.5],
  ]);
  expect(Math.abs(colors[0] - encode(0.2))).toBeLessThanOrEqual(2);
  // D = 2x - 1, so half of the diffuse at x = 0.75
  expect(Math.abs(colors[1] - encode(0.2 + 0.8 * 0.5))).toBeLessThanOrEqual(2);
  expect(Math.abs(colors[2] - encode(0.2 + 0.8 * 0.9))).toBeLessThanOrEqual(2);
});

it("keeps the shade on the polygon when a later uv is off the mapping", async () => {
  using s = smoothScene({
    directional: { direction: [-1, 0, 0], intensity: 1 },
  });
  s.root.material!.background = await imageOf("#fff");
  const normal = (x: number) => [2 * x - 1, 0, 0.5];
  s.root.addPolygon(
    SQUARE.map((v, i) => ({
      ...v,
      uv: i === 3 ? [0.6, 1] : v.uv,
      normal: normal(v.position[0]),
    })),
  );
  const [left, right] = await shown(s, [
    [0.75, 0.2],
    [0.75, 0.8],
  ]);
  expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
});

it("takes the face normal for a vertex without one", async () => {
  using s = smoothScene(SIDE);
  s.root.addPolygon(SQUARE);
  const [color] = await shown(s, [[0.5, 0.5]]);
  const toLight = vec3.normalize(vec3.create(), [0.5, 0.3, 1]);
  expect(Math.abs(color - encode(toLight[2]))).toBeLessThanOrEqual(2);
});

it("stays on the polygon whatever the texture does", async () => {
  const white = await imageOf("#fff");
  const weights = [0.2, 0.5, 0.8];
  const points = weights.map((x) => [x, 0.1]);
  const expected = weights.map((x) => encode(litAt([0.9 - x, x, 0.1])));
  const uvCases = [
    (uv: readonly number[]) => [uv[0] * 3, uv[1] * 3],
    (uv: readonly number[]) => [uv[0] + 0.4 * uv[1], 0.3 * uv[0] + uv[1]],
  ];
  for (const toUV of uvCases) {
    using s = smoothScene(SIDE);
    s.root.material!.background = white;
    s.root.material!.flipbook = { columns: 2, rows: 1 };
    s.root.addPolygon(CORNERS.map((v) => ({ ...v, uv: toUV(v.uv) })));
    const colors = await shown(s, points);
    colors.forEach((color, i) =>
      expect(Math.abs(color - expected[i])).toBeLessThanOrEqual(2),
    );
  }
});

it("follows the fold in a smooth gradient, and goes back to flat", async () => {
  using s = smoothScene();
  const polygon = s.root.addPolygon(SQUARE);
  await s.container.bake();
  const center = () =>
    getComputedStyle(polygon.contentElement, "::before").getPropertyValue(
      "--c3r-gradient-center",
    );
  s.root.transform = Transform.rotateX(1);
  expect(Number(center())).toBeCloseTo(Math.cos(1), 3);
  const clip = polygon.contentElement.parentElement!.style;
  expect(clip.clipPath).not.toBe("");

  s.root.material!.shading = "flat";
  await s.container.bake();
  expect(shadeOf(polygon)).toBeCloseTo(Math.cos(1), 3);
  expect(clip.clipPath).toBe("");
});
