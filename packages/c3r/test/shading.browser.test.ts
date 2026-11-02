import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  Container,
  CssValue,
  ElementObject,
  Filter,
  Group,
  type Lights,
  Material,
  OrthographicCamera,
  type Polygon,
  type Shading,
  type Specular,
  Transform,
  Tween,
  type Vertex,
} from "c3r";
import { mat3, type ReadonlyMat4, vec3, type ReadonlyVec3 } from "gl-matrix";
import { cube, cylinder, icosphere } from "primitive-geometry";
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
    { point: { position: [0, 0, 1], intensity: -1 } },
    {
      directional: { direction: [0, 0, -1], intensity: 1 },
      point: { position: [0, 0, 1], intensity: 1 },
    },
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

const splitImage = (left: string, right: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 8;
  const context = canvas.getContext("2d")!;
  context.fillStyle = left;
  context.fillRect(0, 0, 4, 8);
  context.fillStyle = right;
  context.fillRect(4, 0, 4, 8);
  return canvas.toDataURL();
};

it("doesn't wrap the image's far edge into a polygon in one tile", async () => {
  const image = splitImage("#f00", "#00f");
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

const SHINY = { intensity: 1, shininess: 8 };

const specularOf = (polygon: Polygon) =>
  Number(
    getComputedStyle(polygon.contentElement, "::after").getPropertyValue(
      "--c3r-specular",
    ),
  );

const blinn = (n: ReadonlyVec3, l: ReadonlyVec3, v: ReadonlyVec3) => {
  const half = vec3.normalize(vec3.create(), vec3.add(vec3.create(), l, v));
  return Math.max(0, vec3.dot(n, l)) * Math.max(0, vec3.dot(n, half)) ** 8;
};

const turned = (pose: Transform | Transform[]) =>
  vec3.transformMat3(
    vec3.create(),
    [0, 0, 1],
    mat3.normalFromMat4(mat3.create(), composeTransforms(pose))!,
  );

const SLANTED: Lights = {
  directional: { direction: [-0.3, -0.2, -1], intensity: 1 },
};
const TO_SLANTED = vec3.normalize(vec3.create(), [0.3, 0.2, 1]);

const glossy = (lights: Lights = SLANTED) => {
  const s = scene(lights);
  s.root.material!.specular = SHINY;
  return s;
};

it("lights a highlight from the light, the groups and the camera", async () => {
  using s = glossy();
  const pose = [Transform.rotateX(0.2), Transform.rotateY(-0.1)];
  const look = [Transform.rotateY(0.3), Transform.rotateX(-0.1)];
  const group = new Group();
  s.root.addChild(group);
  group.transform = pose;
  s.container.camera.transform = look;
  const polygon = group.addPolygon(SQUARE);
  await s.container.bake();
  expect(specularOf(polygon)).toBeCloseTo(
    blinn(turned(pose), TO_SLANTED, turned(look)),
    2,
  );

  const ahead = specularOf(polygon);
  s.container.camera.transform = [...look, Transform.translate([3, 4, 5])];
  expect(specularOf(polygon)).toBe(ahead);
});

it("follows the tweens of a camera and of a group", async () => {
  using s = glossy();
  const group = new Group();
  s.root.addChild(group);
  const polygon = group.addPolygon(SQUARE);
  await s.container.bake();
  const at = (step: Transform) =>
    new Tween({ from: step, keyframes: [step], paused: true });
  using camera = at(Transform.rotateY(0.7));
  using tween = at(Transform.rotateX(0.3));
  s.container.camera.tween = camera;
  group.tween = tween;
  expect(specularOf(polygon)).toBeCloseTo(
    blinn(
      turned(Transform.rotateX(0.3)),
      TO_SLANTED,
      turned(Transform.rotateY(0.7)),
    ),
    2,
  );
});

it("has no highlight on a face turned from the light", async () => {
  for (const direction of [
    [0, 0, 1],
    [1, 0, 0.01],
  ]) {
    using s = glossy({ directional: { direction, intensity: 1 } });
    const polygon = s.root.addPolygon(SQUARE);
    await s.container.bake();
    expect(specularOf(polygon)).toBe(0);
  }
});

it("inherits, turns off and stays off the fold of other polygons", async () => {
  using s = scene();
  const shiny = new Group();
  s.root.addChild(shiny);
  shiny.material = new Material();
  shiny.material.specular = SHINY;
  const lit = shiny.addPolygon(SQUARE);
  const off = new Group();
  shiny.addChild(off);
  off.material = new Material();
  off.material.specular = { intensity: 0, shininess: 8 };
  const dull = off.addPolygon(SQUARE);
  const other = new Group();
  s.root.addChild(other);
  const plain = other.addPolygon(SQUARE);
  s.container.camera.transform = Transform.rotateY(0.5);
  await s.container.bake();

  const toHalf = (polygon: Polygon) =>
    Number(
      getComputedStyle(polygon.domElement).getPropertyValue("--c3r-to-half-2"),
    );
  const glows = (polygon: Polygon) =>
    getComputedStyle(polygon.contentElement, "::after").content !== "none";
  expect(toHalf(lit)).toBeCloseTo(Math.cos(0.25), 2);
  expect(glows(lit)).toBe(true);
  for (const polygon of [dull, plain]) {
    expect(toHalf(polygon)).toBe(0);
    expect(glows(polygon)).toBe(false);
  }

  shiny.material.specular = null;
  await s.container.bake();
  expect(glows(lit)).toBe(false);
});

it("refuses an invalid specular", () => {
  const material = new Material();
  for (const bad of [
    { intensity: -1, shininess: 8 },
    { intensity: 1, shininess: 0 },
  ])
    expect(() => (material.specular = bad)).toThrow(RangeError);
  expect(material.specular).toBe(null);
});

// Lit and seen head on, so it peaks at the intensity
const glint = async ({
  background = [0, 0, 0, 1],
  map,
  shading = "flat",
  uv = (x) => x,
}: {
  background?: Material["background"];
  map?: string;
  shading?: Shading;
  uv?: (x: number) => number;
} = {}) => {
  const s = scene();
  s.container.camera = new OrthographicCamera(0, 1, 1, 0);
  s.root.material!.shading = shading;
  s.root.material!.background = background;
  s.root.material!.specular = { intensity: 0.25, shininess: 8, map };
  s.root.addPolygon(SQUARE.map((v) => ({ ...v, uv: [uv(v.uv[0]), v.uv[1]] })));
  await s.container.bake();
  if (map) {
    const image = new Image();
    image.src = map;
    await image.decode();
  }
  await flush();
  await flush();
  return s;
};

const PEAK = encode(0.25);

const near = (color: number[], expected: number[], within = 2) =>
  color.forEach((c, i) =>
    expect(Math.abs(c - expected[i])).toBeLessThanOrEqual(within),
  );

it("adds a highlight over black, white under a tint, not on a hole", async () => {
  {
    using s = await glint();
    near(await centerColor(s.container.domElement), [PEAK, PEAK, PEAK]);
  }
  {
    using s = await glint({ background: [1, 1, 1, 1] });
    s.root.material!.filter = Filter.tint([1, 0, 0]);
    await flush();
    near(await centerColor(s.container.domElement), [255, PEAK, PEAK]);
  }
  {
    using s = await glint({ background: await imageOf(null) });
    s.container.domElement.style.background = "black";
    expect(await centerColor(s.container.domElement)).toEqual([0, 0, 0]);
  }
});

const FAN = [[0, 0, 1], leaning(1, 0), leaning(0, 1)].map((normal, i) => ({
  position: [i === 1 ? 1 : 0, i === 2 ? 1 : 0, 0],
  uv: [0, 0],
  normal,
}));

const fanned = (specular: Specular) => {
  const s = smoothScene();
  s.root.material!.background = [0, 0, 0, 1];
  s.root.material!.specular = specular;
  s.root.addPolygon(FAN);
  return s;
};

it("draws the power curve of n·h across a smooth polygon", async () => {
  using s = fanned(SHINY);
  const weights = [
    [0.9, 0.05, 0.05],
    [0.5, 0.25, 0.25],
    [0.05, 0.9, 0.05],
  ];
  const colors = await shown(
    s,
    weights.map(([, x, y]) => [x, y]),
  );
  weights.forEach((b, i) => {
    const z = b[0] + (b[1] + b[2]) * leaning(1, 0)[2];
    expect(Math.abs(colors[i] - encode(z ** 9))).toBeLessThanOrEqual(5);
  });
});

it("fades out below the lobe at any intensity", async () => {
  using s = fanned({ intensity: 12.75, shininess: 100 });
  const [far] = await shown(s, [[0.9, 0.05]]);
  expect(far).toBeLessThanOrEqual(1);
});

it("keeps a highlight in range under a scale that isn't uniform", async () => {
  for (const shading of ["flat", "smooth"] as const) {
    using s = await glint({ shading });
    s.root.transform = Transform.scale([1, 3, 1]);
    near(await shown(s, across(0.5)), [PEAK]);
  }
});

it("turns a tight highlight without visible steps", async () => {
  using s = glossy(TOP);
  s.root.material!.specular = { intensity: 1, shininess: 500 };
  const polygon = s.root.addPolygon(SQUARE);
  await s.container.bake();
  s.container.camera.transform = Transform.rotateY(0.07);
  expect(
    Math.abs(specularOf(polygon) - Math.cos(0.035) ** 500),
  ).toBeLessThanOrEqual(0.06);
});

it("has no seam between smooth polygons near the terminator", async () => {
  const strip = (x0: number, x1: number, n0: vec3, n1: vec3) =>
    [
      { x: x0, y: 0, normal: n0 },
      { x: x1, y: 0, normal: n1 },
      { x: x1, y: 1, normal: n1 },
      { x: x0, y: 1, normal: n0 },
    ].map(({ x, y, normal }) => ({
      position: [x, y, 0],
      uv: [0, 0],
      normal,
    }));
  using s = smoothScene({
    directional: { direction: [-1, 0, -0.5], intensity: 1 },
  });
  s.root.material!.background = [0, 0, 0, 1];
  s.root.material!.specular = SHINY;
  s.root.addPolygon(strip(0, 0.5, leaning(-0.5, 0), leaning(0, 0)));
  s.root.addPolygon(strip(0.5, 1, leaning(0, 0), leaning(0.5, 0)));
  const [left, right] = await shown(s, [
    [0.47, 0.5],
    [0.53, 0.5],
  ]);
  // The true change between these two points
  expect(Math.abs(right - left - 17)).toBeLessThanOrEqual(3);
});

const LEFT_WHITE = splitImage("white", "black");

const across = (...xs: number[]) => xs.map((x) => [x, 0.5]);

it("scales a highlight by the map's texels, on either shading", async () => {
  for (const shading of ["flat", "smooth"] as const) {
    using s = await glint({ map: LEFT_WHITE, shading });
    near(await shown(s, across(0.01, 0.25, 0.75, 0.99)), [PEAK, PEAK, 0, 0]);
  }
  using gray = await glint({ map: await imageOf("rgb(128 128 128)") });
  near(await shown(gray, across(0.5)), [(PEAK * 128) / 255], 3);
});

it("maps a specular map by the polygon's uvs", async () => {
  using s = await glint({ map: LEFT_WHITE, uv: (x) => 0.55 + x * 0.4 });
  near(await shown(s, across(0.1, 0.5, 0.9)), [0, 0, 0]);
});

it("doesn't take a parent's map, and takes an empty one as none", async () => {
  for (const map of [undefined, ""]) {
    using s = await glint({ map: LEFT_WHITE });
    s.root.children[0].domElement.style.display = "none";
    const child = new Group();
    s.root.addChild(child);
    child.material = new Material();
    child.material.specular = { intensity: 0.25, shininess: 8, map };
    child.addPolygon(SQUARE);
    near(await shown(s, across(0.75)), [PEAK]);
  }
});

const POINT: Lights = {
  ambient: { intensity: 0.1 },
  point: { position: [0.4, 0.5, 0.2], intensity: 0.1 },
};

// Over a white plane at z = 0
const onFloor = (points: number[][], { ambient, point } = POINT) =>
  points.map(([x, y]) => {
    const [px, py, pz] = point!.position;
    const d = Math.hypot(x - px, y - py, pz);
    return encode(
      Math.min(1, ambient!.intensity + (point!.intensity * pz) / d ** 3),
    );
  });

const whiteFloor = (lights = POINT) => {
  const s = smoothScene(lights);
  s.root.material!.background = [1, 1, 1, 1];
  return s;
};

const GRID = [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((x) =>
  [0.1, 0.3, 0.5, 0.7, 0.9].map((y) => [x, y]),
);

const rect = (x0: number, x1: number, y0 = 0, y1 = 1): Vertex[] =>
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => ({ position: [x, y, 0], uv: [x, y] }));

// Each lays out at its own scale, the one at y = 0.5 at the largest
const SPLIT_PLANE = [
  rect(0, 0.45),
  rect(0.45, 0.47, 0, 0.45),
  rect(0.45, 0.47, 0.45, 0.55),
  rect(0.45, 0.47, 0.55, 1),
  rect(0.47, 1),
];

const pauseAt = (element: Element, time: number) => {
  for (const animation of element.getAnimations()) {
    animation.pause();
    animation.currentTime = time;
  }
};

const biggestStep = (shades: number[]) =>
  Math.max(...shades.slice(1).map((shade, i) => Math.abs(shade - shades[i])));

it("draws a point light's falloff across a plane", async () => {
  using s = whiteFloor();
  s.root.addPolygon(SQUARE);
  near(await shown(s, GRID), onFloor(GRID), 5);
});

it("has no seam across a plane split into unequal polygons", async () => {
  const lights: Lights = {
    ambient: { intensity: 0.1 },
    point: { position: [0.4, 0.5, 0.2], intensity: 0.02 },
  };
  using s = whiteFloor(lights);
  for (const polygon of SPLIT_PLANE) s.root.addPolygon(polygon);
  const row = Array.from({ length: 40 }, (_, i) => [0.3 + i / 200, 0.5]);
  const shades = await shown(s, row);
  near(shades, onFloor(row, lights), 5);
  expect(biggestStep(shades)).toBeLessThanOrEqual(5);
});

it("stays accurate on a small polygon under a grazing light", async () => {
  const lights: Lights = {
    ambient: { intensity: 0.1 },
    point: { position: [0.5, 0.5, 0.01], intensity: 0.002 },
  };
  using s = whiteFloor(lights);
  s.root.addPolygon(rect(0.8, 0.9, 0.8, 0.9));
  s.root.addPolygon(rect(0.2, 0.7));
  const points = [
    [0.85, 0.85],
    [0.65, 0.5],
    [0.3, 0.5],
  ];
  near(await shown(s, points), onFloor(points, lights), 6);
});

it("shows ambient alone with the light below a plane", async () => {
  const lights: Lights = {
    ambient: { intensity: 0.1 },
    point: { position: [0.5, 0.5, -0.2], intensity: 1 },
  };
  for (const shading of ["flat", "smooth"] as const) {
    using s = whiteFloor(lights);
    s.root.material!.shading = shading;
    s.root.addPolygon(SQUARE);
    near(await shown(s, across(0.2, 0.5, 0.8)), Array(3).fill(encode(0.1)));
  }
});

const DIM: Lights = {
  ambient: { intensity: 0.1 },
  point: { position: [0.4, 0.5, 0.2], intensity: 0.01 },
};

const DIM_AT_CENTER = (0.01 * 0.2) / Math.hypot(0.1, 0.2) ** 3;

it("gives a flat polygon the light at its center", async () => {
  using s = whiteFloor(DIM);
  s.root.material!.shading = "flat";
  const polygon = s.root.addPolygon(SQUARE);
  await s.container.bake();
  expect(shadeOf(polygon)).toBeCloseTo(0.1 + DIM_AT_CENTER, 3);
});

it("finds a point light through scales, rotations and tweens", async () => {
  const position: ReadonlyVec3 = [1, 2, 3];
  using s = scene({
    ambient: { intensity: 0.1 },
    point: { position, intensity: 2 },
  });
  const outer = new Group();
  s.root.addChild(outer);
  outer.transform = [
    Transform.translate([0.3, -0.2, 0.5]),
    Transform.rotateY(0.7),
    Transform.scale(2),
  ];
  const inner = new Group();
  outer.addChild(inner);
  inner.transform = Transform.translate([0.1, 0.2, 0.3]);
  inner.tween = new Tween({
    from: [
      Transform.rotateX(0),
      Transform.translate([0, 0, 0]),
      Transform.scale(1),
    ],
    keyframes: [
      [
        Transform.rotateX(1.2),
        Transform.translate([0.1, 0.2, 0.3]),
        Transform.scale(1.5),
      ],
    ],
    duration: 10,
    loop: true,
  });
  const polygon = inner.addPolygon(SQUARE);
  await s.container.bake();
  pauseAt(inner.domElement, 3700);
  await flush();
  const toWorld = new DOMMatrix(
    getComputedStyle(outer.domElement).transform,
  ).multiply(new DOMMatrix(getComputedStyle(inner.domElement).transform));
  const center = toWorld.transformPoint(new DOMPoint(0.5, 0.5, 0, 1));
  const axis = toWorld.transformPoint(new DOMPoint(0, 0, 1, 0));
  const l: ReadonlyVec3 = [
    position[0] - center.x,
    position[1] - center.y,
    position[2] - center.z,
  ];
  const normal = vec3.normalize(vec3.create(), [axis.x, axis.y, axis.z]);
  expect(shadeOf(polygon)).toBeCloseTo(
    0.1 + Math.max(0, (2 * vec3.dot(normal, l)) / vec3.length(l) ** 3),
    2,
  );
});

it("scales only the light by a group's gain, down the tree", async () => {
  using s = whiteFloor(DIM);
  s.root.material!.shading = "flat";
  const outer = new Group();
  const inner = new Group();
  s.root.addChild(outer);
  outer.addChild(inner);
  const polygon = inner.addPolygon(SQUARE);
  outer.lightGain = 0.5;
  inner.lightGain = CssValue.mul(0.25, 2);
  await s.container.bake();
  expect(shadeOf(polygon)).toBeCloseTo(0.1 + DIM_AT_CENTER / 4, 3);
  outer.lightGain = 1;
  await flush();
  expect(shadeOf(polygon)).toBeCloseTo(0.1 + DIM_AT_CENTER / 2, 3);
  outer.lightGain = 0;
  await flush();
  expect(shadeOf(polygon)).toBeCloseTo(0.1, 3);
  expect(() => (outer.lightGain = -1)).toThrow(RangeError);
});

it("animates a gain on a group's clock", async () => {
  using s = whiteFloor(DIM);
  s.root.material!.shading = "flat";
  const group = new Group();
  s.root.addChild(group);
  const polygon = group.addPolygon(SQUARE);
  group.clock = true;
  group.lightGain = CssValue.add(
    1,
    CssValue.mul(0.5, CssValue.fn("sin", CssValue.mul(Group.time, 10))),
  );
  await s.container.bake();
  const shades = new Set<number>();
  for (let i = 0; i < 4; i++) {
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 60));
    shades.add(shadeOf(polygon));
  }
  expect(shades.size).toBeGreaterThan(1);
});

const LIT_AT_09: Lights[] = [
  {
    ambient: { intensity: 0.1 },
    directional: { direction: [0, 0, -1], intensity: 0.8 },
  },
  // Far enough to be even, its shade 0.1 + 0.8
  {
    ambient: { intensity: 0.1 },
    point: { position: [0.5, 0.5, 10], intensity: 80 },
  },
];

it("scales the light by a diffuse map, on any shading and light", async () => {
  for (const lights of LIT_AT_09)
    for (const [shading, planar] of [
      ["flat", true],
      ["smooth", true],
      ["smooth", false],
    ] as const) {
      using s = whiteFloor(lights);
      s.root.material!.shading = shading;
      s.root.material!.diffuse = { map: splitImage("white", "black") };
      s.root.addPolygon(SQUARE, { planar });
      near(await shown(s, across(0.25, 0.75)), [encode(0.9), encode(0.1)], 5);
    }
});

it("matches no map under a white diffuse map, even near the terminator", async () => {
  const row = across(0.52, 0.55, 0.6, 0.65, 0.7, 0.8, 0.95);
  const lit = async (map?: string) => {
    using s = whiteFloor({
      directional: { direction: [-1, 0, 0], intensity: 1 },
    });
    if (map) s.root.material!.diffuse = { map };
    s.root.addPolygon(
      rect(0, 1).map((v) => ({
        ...v,
        normal: leaning(v.position[0] * 2 - 1, 0),
      })),
      { planar: false },
    );
    return await shown(s, row);
  };
  near(await lit(splitImage("white", "white")), await lit(), 8);
});

it("doesn't take a diffuse map from around a nested container", async () => {
  using outer = scene();
  outer.root.material!.diffuse = { map: splitImage("black", "black") };
  outer.container.camera = new OrthographicCamera(0, 1, 1, 0);
  const holder = new ElementObject(document.createElement("div"));
  outer.root.addChild(holder);
  using inner = whiteFloor(LIT_AT_09[1]);
  holder.element.append(inner.container.domElement);
  inner.root.addPolygon(SQUARE);
  await outer.container.bake();
  await inner.container.bake();
  await flush();
  const style = getComputedStyle(
    inner.root.children[0].domElement.querySelector(".c3r-polygon-content")!,
    "::before",
  );
  expect(style.backgroundImage).not.toContain("url(");
});

it("maps a diffuse map by uvs, blends gray, and a child drops it", async () => {
  using s = whiteFloor(LIT_AT_09[1]);
  s.root.material!.diffuse = { map: splitImage("#808080", "black") };
  const polygon = s.root.addPolygon(SQUARE);
  near(await shown(s, across(0.25)), [(encode(0.1) + encode(0.9)) / 2], 6);
  polygon.domElement.remove();
  s.root.material!.shading = "flat";
  const inBlack = s.root.addPolygon(
    SQUARE.map(({ position, uv }) => ({
      position,
      uv: [0.55 + uv[0] * 0.4, uv[1]],
    })),
  );
  near(await shown(s, across(0.1, 0.9)), Array(2).fill(encode(0.1)), 5);
  inBlack.domElement.remove();
  s.root.material!.shading = "smooth";
  const child = new Group();
  s.root.addChild(child);
  child.material = new Material();
  child.material.diffuse = {};
  child.addPolygon(SQUARE);
  near(await shown(s, across(0.75)), [encode(0.9)], 5);
});

// Bends up past x = 0.5, its normals turning with it
const bentStrip = () => {
  const corner = (x: number, y: number): Vertex => {
    const rise = Math.max(0, x - 0.5);
    return {
      position: [x, y, rise ** 2],
      uv: [0, 0],
      normal: vec3.normalize(vec3.create(), [-2 * rise, 0, 1]),
    };
  };
  const xs = [0, 0.25, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  return xs.slice(1).flatMap((x, i) => [
    [corner(xs[i], 0), corner(x, 0), corner(x, 1)],
    [corner(xs[i], 0), corner(x, 1), corner(xs[i], 1)],
  ]);
};

it("lights a curve continuously, with a plane joining it", async () => {
  using s = whiteFloor({
    ambient: { intensity: 0.05 },
    point: { position: [0.7, 0.5, 0.25], intensity: 0.06 },
  });
  s.root.addTriangles(bentStrip());
  const row = Array.from({ length: 100 }, (_, i) => [0.005 + i / 100, 0.37]);
  expect(biggestStep(await shown(s, row))).toBeLessThanOrEqual(6);
});

it("splits a cylinder for a point light, which then has no seams", async () => {
  using s = whiteFloor({
    ambient: { intensity: 0.05 },
    point: { position: [0.1, 0.15, 0.8], intensity: 0.3 },
  });
  const group = new Group();
  s.root.addChild(group);
  group.transform = [
    Transform.translate([0.5, 0.5, 0]),
    Transform.rotateX(0.4),
  ];
  group.addMesh(
    cylinder({
      height: 1,
      radiusBase: 0.4,
      radiusApex: 0.4,
      nx: 8,
      capBase: false,
      capApex: false,
    }),
    { splitCurved: true },
  );
  const row = Array.from({ length: 100 }, (_, i) => [0.2 + i / 166, 0.5]);
  expect(biggestStep(await shown(s, row))).toBeLessThanOrEqual(8);
});

it("spreads a curved polygon's three vertices around it", async () => {
  using s = whiteFloor({
    ambient: { intensity: 0.1 },
    point: { position: [0.77, 0.545, 0.675], intensity: 0.4 },
  });
  const sides = 32;
  s.root.addPolygon(
    Array.from({ length: sides }, (_, i) => {
      const [x, y] = [
        Math.cos((i / sides) * 2 * Math.PI),
        Math.sin((i / sides) * 2 * Math.PI),
      ];
      return {
        position: [0.5 + 0.45 * x, 0.5 + 0.45 * y, 0],
        uv: [0, 0],
        normal: vec3.normalize(vec3.create(), [0.3 * x, 0.3 * y, 1]),
      };
    }),
  );
  // Clamped to black on the far side when they sit next to each other
  const shades = await shown(s, across(0.1, 0.5, 0.9));
  for (const shade of shades) expect(shade).toBeGreaterThan(encode(0.15));
});

it("picks a curved polygon's three vertices off a line", async () => {
  using s = whiteFloor();
  const polygon = s.root.addPolygon(
    [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [1, 0],
      [1, 1],
    ].map(([x, y]) => ({ position: [x, y, 0], uv: [0, 0] })),
    { planar: false },
  );
  await s.container.bake();
  const { style } = polygon.domElement;
  const across = [3, 4, 5].map((k) =>
    Number(style.getPropertyValue(`--c3r-weight-${k}`)),
  );
  expect(Math.max(...across.map(Math.abs))).toBeGreaterThan(0);
});

it("leaves the element's own animation when a light has no tween", () => {
  using s = scene();
  const { style } = s.container.domElement;
  style.transition = "opacity 1s";
  s.container.lights = { ambient: { intensity: 0.5 } };
  expect(style.transition).toBe("opacity 1s");
});

it("honors planar: false through addTriangles", async () => {
  using s = whiteFloor();
  const [polygon] = s.root.addTriangles(
    [
      [SQUARE[0], SQUARE[1], SQUARE[2]],
      [SQUARE[0], SQUARE[2], SQUARE[3]],
    ],
    { planar: false },
  );
  await s.container.bake();
  expect(polygon.domElement.classList.contains("c3r-planar")).toBe(false);
});

const glossyFloor = (lights: Lights, intensity = 1) => {
  const s = smoothScene(lights);
  s.root.material!.background = [0, 0, 0, 1];
  s.root.material!.specular = { intensity, shininess: 32 };
  return s;
};

// Under an orthographic camera turned by the view angle around y, x foreshortens
const highlightOn = (x: number, y: number, { point }: Lights, view: number) => {
  const [px, py, h] = point!.position;
  const l = [px - x, py - y, h];
  const d = Math.hypot(...l);
  const lit = (point!.intensity * h) / d ** 3;
  const v = [Math.sin(view), 0, Math.cos(view)];
  const sum = l.map((c, i) => c / d + v[i]);
  return encode(Math.min(1, lit * (sum[2] / Math.hypot(...sum)) ** 32));
};

it("peaks a plane's highlight where and as bright as the formula, head on", async () => {
  const lights: Lights = {
    point: { position: [0.4, 0.5, 0.3], intensity: 0.05 },
  };
  using s = glossyFloor(lights);
  s.root.addPolygon(SQUARE);
  const points = [
    [0.4, 0.5],
    [0.5, 0.5],
    [0.4, 0.35],
    [0.8, 0.5],
  ];
  near(
    await shown(s, points),
    points.map(([x, y]) => highlightOn(x, y, lights, 0)),
    8,
  );
});

it("moves a plane's highlight toward the viewer under a turned camera", async () => {
  const view = 0.7;
  const lights: Lights = {
    point: { position: [0.3, 0.5, 0.25], intensity: 0.04 },
  };
  using s = glossyFloor(lights);
  s.root.addPolygon(rect(-1, 3, -1, 3));
  s.container.camera.transform = Transform.rotateY(view);
  const xs = Array.from({ length: 79 }, (_, i) => 0.01 + i / 80);
  const shades = await shown(s, across(...xs));
  const exact = xs.map((x) =>
    highlightOn(x / Math.cos(view), 0.5, lights, view),
  );
  const peakOf = (row: number[]) => xs[row.indexOf(Math.max(...row))];
  expect(Math.abs(peakOf(shades) - peakOf(exact))).toBeLessThanOrEqual(0.04);
  expect(
    Math.abs(Math.max(...shades) - Math.max(...exact)),
  ).toBeLessThanOrEqual(12);
});

it("draws a highlight the same across a split plane", async () => {
  // Off the strip of small polygons, so they show its slope
  const lights: Lights = {
    point: { position: [0.36, 0.5, 0.3], intensity: 0.05 },
  };
  const row = Array.from({ length: 40 }, (_, i) => [0.36 + i / 200, 0.5]);
  using whole = glossyFloor(lights);
  whole.root.addPolygon(SQUARE);
  const unsplit = await shown(whole, row);
  using s = glossyFloor(lights);
  for (const polygon of SPLIT_PLANE) s.root.addPolygon(polygon);
  near(await shown(s, row), unsplit, 3);
});

it("draws a highlight across curved triangles near the light", async () => {
  using s = glossyFloor({
    point: { position: [0.75, 0.05, 0.2], intensity: 0.02 },
  });
  s.root.addTriangles(bentStrip());
  const row = Array.from({ length: 50 }, (_, i) => [0.52 + i / 105, 0.05]);
  const shades = await shown(s, row);
  expect(Math.max(...shades)).toBeGreaterThan(encode(0.1));
  expect(biggestStep(shades)).toBeLessThanOrEqual(10);
});

it("draws no highlight from below, without intensity or from behind", async () => {
  for (const [z, intensity, turn] of [
    [-0.3, 1, 0],
    [0.3, 0, 0],
    [0.3, 1, 2.2],
  ]) {
    using s = glossyFloor(
      { point: { position: [0.5, 0.5, z], intensity: 0.05 } },
      intensity,
    );
    s.root.material!.doubleSided = true;
    s.root.addPolygon(rect(-1, 3, -1, 3));
    s.container.camera.transform = Transform.rotateY(turn);
    near(await shown(s, across(0.1, 0.3, 0.5)), [0, 0, 0], 1);
  }
});

it("lights a flat polygon's highlight from its center", async () => {
  const lights: Lights = {
    point: { position: [0.4, 0.5, 0.3], intensity: 0.05 },
  };
  using s = glossyFloor(lights);
  s.root.material!.shading = "flat";
  s.root.addPolygon(SQUARE);
  near(
    await shown(s, across(0.1, 0.9)),
    Array(2).fill(highlightOn(0.5, 0.5, lights, 0)),
    3,
  );
});

it("moves a light with a tween, a group with the same stays on it", async () => {
  const orbit = new Tween({
    from: [Transform.rotateY(0), Transform.translate([0, 0, 0])],
    keyframes: [[Transform.rotateY(2), Transform.translate([1, 0, 0.5])]],
    duration: 10,
    loop: true,
  });
  using s = scene({
    point: { position: [3, 2, 0], intensity: 1, tween: [orbit, orbit] },
  });
  const carrier = new Group();
  s.root.addChild(carrier);
  carrier.tween = [orbit, orbit];
  const polygon = s.root.addPolygon(SQUARE);
  await s.container.bake();
  pauseAt(s.container.domElement, 3000);
  pauseAt(carrier.domElement, 3000);
  await flush();
  const at = new DOMMatrix(
    getComputedStyle(carrier.domElement).transform,
  ).transformPoint(new DOMPoint(3, 2, 0, 1));
  const style = getComputedStyle(polygon.domElement);
  [at.x, at.y, at.z].forEach((c, k) =>
    expect(Number(style.getPropertyValue(`--c3r-to-point-${k}`))).toBeCloseTo(
      c,
      2,
    ),
  );
});

it("refuses a light's tween it can't follow", () => {
  using s = scene();
  const { lights } = s.container;
  const before = s.container.domElement.style.cssText;
  for (const tween of [
    new Tween({ keyframes: [Filter.opacity(0.5)] }),
    new Tween({
      keyframes: [
        Transform.matrix([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]),
      ],
    }),
    {} as Tween,
  ])
    expect(
      () =>
        (s.container.lights = {
          point: { position: [0, 0, 1], intensity: 1, tween },
        }),
    ).toThrow();
  expect(s.container.lights).toBe(lights);
  expect(s.container.domElement.style.cssText).toBe(before);
});

it("follows a specular map on a plane under a point light", async () => {
  const lights: Lights = {
    point: { position: [0.5, 0.5, 0.3], intensity: 0.05 },
  };
  using s = glossyFloor(lights);
  s.root.material!.specular = {
    intensity: 1,
    shininess: 32,
    map: splitImage("white", "black"),
  };
  s.root.addPolygon(SQUARE);
  const [left, right] = await shown(s, across(0.4, 0.6));
  expect(Math.abs(left - highlightOn(0.4, 0.5, lights, 0))).toBeLessThan(8);
  expect(right).toBeLessThanOrEqual(1);
});

it("removes a plane's highlight with its specular", async () => {
  using s = glossyFloor({
    point: { position: [0.5, 0.5, 0.3], intensity: 0.05 },
  });
  const polygon = s.root.addPolygon(SQUARE);
  await s.container.bake();
  const [glint] = polygon.contentElement.children;
  await s.container.bake();
  expect([...polygon.contentElement.children]).toEqual([glint]);
  const added = vi.fn();
  new MutationObserver(added).observe(polygon.contentElement, {
    childList: true,
  });
  await s.container.bake();
  await flush();
  expect(added).not.toHaveBeenCalled();
  s.root.material!.specular = null;
  await s.container.bake();
  expect(polygon.contentElement.childElementCount).toBe(0);
});

it("leaves a highlight alone under a diffuse map", async () => {
  const lights: Lights = {
    point: { position: [0.5, 0.5, 0.3], intensity: 0.05 },
  };
  using s = glossyFloor(lights);
  s.root.material!.diffuse = { map: splitImage("black", "black") };
  s.root.addPolygon(SQUARE);
  near(await shown(s, across(0.4)), [highlightOn(0.4, 0.5, lights, 0)], 8);
});
