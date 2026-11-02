import { mat3, mat4, type ReadonlyMat4, vec3 } from "gl-matrix";

import { Camera } from "../css/Camera.js";
import { CssMatrix, CssVector } from "../css/CssMatrix.js";
import { CssValue, cssRaw, cssVar, textOf } from "../css/CssValue.js";
import type { Shading, Specular } from "../css/Material.js";
import { insertRule } from "../css/styles.js";
import { composeTransforms } from "../css/Transform.js";
import { hasFilter, transformSteps, type Tween } from "../css/Tween.js";

import { type Accumulator, libraryAccumulator } from "./Accumulator.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D } from "./Object3D.js";
import { type Polygon, setGlint, setSmooth, setVector } from "./Polygon.js";

// A unit determinant spares normalizing per polygon, exact under rotation and
// uniform scale
function staticNormal(matrix: ReadonlyMat4): CssMatrix {
  const m = mat3.normalFromMat4(mat3.create(), matrix);
  if (!m) return CssMatrix.identity(3);
  const size = Math.cbrt(Math.abs(mat3.determinant(m)));
  return new CssMatrix(mat3.multiplyScalar(m, m, 1 / size));
}

const stepsOf = (tween: Tween | readonly Tween[] | null) =>
  [tween ?? []].flat().flatMap((t) => transformSteps(t));

const normalOf = (
  matrix: ReadonlyMat4,
  tween: Tween | readonly Tween[] | null,
): CssMatrix =>
  stepsOf(tween).reduce(
    (out, { step, args }) => (step.normal ? out.mul(step.normal(args)) : out),
    staticNormal(matrix),
  );

// (N n)·l = n·(Nᵀ l), so the light moves into the node's space
const lightInput = (node: Object3D | Camera): CssMatrix | null =>
  node instanceof Group
    ? normalOf(matrixOf(node), node.tween).transpose()
    : null;

// Into a group's space, scaled so that xyz keeps its world length: the fourth
// component is the scale so far, and xyz / w the position
const positionStep = ({
  step,
  args,
}: ReturnType<typeof stepsOf>[number]): CssMatrix => {
  if (step.moves) {
    const to = args.map((arg) => cssRaw(`calc(-1 * ${arg} / 1px)`, "<number>"));
    return new CssMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...to, 1]);
  }
  if (!step.normal) return CssMatrix.identity(4);
  const n = step.normal(args).transpose().components;
  const size = step.rotates
    ? 1
    : CssValue.fn(
        "pow",
        CssValue.fn(
          "abs",
          args
            .map((arg) => cssRaw(arg, "<number>"))
            .reduce((a, b) => CssValue.mul(a, b)),
        ),
        1 / 3,
      );
  return new CssMatrix([
    ...n.slice(0, 3),
    0,
    ...n.slice(3, 6),
    0,
    ...n.slice(6),
    0,
    0,
    0,
    0,
    size,
  ]);
};

// A point light's tween, forward: its last step applies first
export const movedPosition = (
  position: readonly number[],
  tween: readonly Tween[],
): CssVector => {
  if (tween.some(hasFilter))
    throw new RangeError("A light can't tween a filter");
  return stepsOf(tween)
    .toReversed()
    .reduce((at, { step, args }) => {
      if (step.moves)
        return at.add(
          new CssVector(
            args.map((arg) => cssRaw(`calc(${arg} / 1px)`, "<number>")),
          ),
        );
      if (!step.normal)
        throw new RangeError("A light can't tween a Transform.matrix");
      if (step.rotates) return step.normal(args).transform(at);
      return at.withComponents(
        at.components.map((c, i) =>
          CssValue.mul(c, cssRaw(args[i], "<number>")),
        ),
      );
    }, new CssVector(position));
};

const positionInput = (node: Object3D | Camera): CssMatrix | null => {
  if (!(node instanceof Group)) return null;
  const matrix = matrixOf(node);
  const inverse = mat4.invert(mat4.create(), matrix);
  const size = Math.cbrt(
    Math.abs(mat3.determinant(mat3.fromMat4(mat3.create(), matrix))),
  );
  return stepsOf(node.tween).reduce(
    (out, step) => positionStep(step).mul(out),
    inverse
      ? new CssMatrix(Array.from(inverse, (n) => n * size))
      : CssMatrix.identity(4),
  );
};

const gainInput = (node: Object3D | Camera): CssValue | null => {
  if (!(node instanceof Group) || node.lightGain === 1) return null;
  const { lightGain: gain } = node;
  return typeof gain === "number" ? CssValue.number(gain) : gain;
};

// A camera turns the way it looks out into the world, so no transpose. Its tween
// moves it after its transform, in the order of a group's
const cameraInput = (node: Object3D | Camera): CssMatrix | null =>
  node instanceof Camera
    ? normalOf(composeTransforms(node.transform), node.tween)
    : null;

const FACE = ["--c3r-face-x", "--c3r-face-y", "--c3r-face-z"];

const faceNormal = new CssVector(FACE.map((p) => cssVar(p, "<number>")));

const light = (name: string) => cssVar(`--c3r-light-${name}`, "<number>");

const toLightAtView = new CssVector(["x", "y", "z"].map(light));

const varVector = (prefix: string) =>
  new CssVector(
    ["x", "y", "z"].map((k) => cssVar(`--${prefix}-${k}`, "<number>")),
  );

const fieldVector = (name: string) => varVector(`c3r-normal-${name}`);

const shadeOf = (term: CssValue) =>
  CssValue.fn("clamp", 0, CssValue.add(light("ambient"), term), 1);

const gradientFields = (toward: CssVector) =>
  ["x", "y", "center"]
    .map((k) => `--c3r-gradient-${k}: ${textOf(fieldVector(k).dot(toward))};`)
    .join(" ");

type VectorFold = Accumulator<CssVector, CssMatrix>;

// A change too small to see stops here instead of restyling the subtree
const rounded = (v: CssVector, step: number) =>
  v.withComponents(v.components.map((c) => CssValue.fn("round", c, step)));

const inputsOf = (name: string) =>
  new CssMatrix(
    Array.from({ length: 9 }, (_, k) =>
      cssVar(`--${name}-${k}-input`, "<number>"),
    ),
  );

const FOLD = {
  syntax: "<number>",
  identity: new CssVector([0, 0, 0]),
  inputIdentity: CssMatrix.identity(3),
  polygonsRead: true,
};

const CONTENT = "> .c3r-polygon-clip > .c3r-polygon-content";

const SPECULAR_STOPS = 8;

// The linear level that encodes to 0
const INVISIBLE = 8e-4;

const encode = (linear: string) =>
  `clamp(0, 1.055 * pow(${linear}, 1 / 2.4) - 0.055, 1)`;

const encoded = (linear: string) => `rgb(255 255 255 / ${encode(linear)})`;

const POINT_STOPS = 10;

const DIFFUSE_MAP_STOPS = 6;

const TINY = 1e-6;

// A scale that isn't uniform leaves a fold longer than one, which a power of it
// would blow up
const unitDot = (a: CssVector, b: CssVector) =>
  CssValue.fn("clamp", 0, a.dot(b), 1);

const PSEUDO =
  'content: ""; position: absolute; inset: 0; pointer-events: none;';

const gray = (level: string) =>
  `rgb(calc(${level} * 255) calc(${level} * 255) calc(${level} * 255))`;

// Screen adds the mapped light to the ambient, which a multiply couldn't
const mappedLight = (ambient: string, light: string) =>
  `background-image: linear-gradient(${gray(ambient)}, ${gray(ambient)}), ${light}, var(--c3r-diffuse-map, none); background-blend-mode: screen, multiply, normal; background-size: 100% 100%, 100% 100%, var(--c3r-uv-size, 100% 100%); background-position: 0 0, 0 0, var(--c3r-uv-position, 0 0);`;

const mapLevel = (shade: string, ambient: string) =>
  `clamp(0, (${encode(shade)} - ${ambient}) / max(1 - ${ambient}, ${TINY}), 1)`;

const specularIntensity = cssVar("--c3r-specular-intensity", "<number>");

const shininess = cssVar("--c3r-shininess", "<number>");

const POWER_CURVE = (() => {
  const from = "var(--c3r-gradient-from)";
  const to = "var(--c3r-gradient-to)";
  const stops = Array.from({ length: SPECULAR_STOPS }, (_, i) => {
    const at = `(${from} + (${to} - ${from}) * ${i / (SPECULAR_STOPS - 1)})`;
    const lit = `clamp(0, var(--c3r-specular-lit) + var(--c3r-specular-slope) * (${at} - var(--c3r-gradient-center)), 1)`;
    const linear = `var(--c3r-specular) * ${lit} * pow(clamp(0, ${at}, 1), var(--c3r-shininess))`;
    return `${encoded(linear)} calc((${at} - var(--c3r-gradient-center) + var(--c3r-gradient-reach)) / var(--c3r-gradient-length) * 1px)`;
  });
  const cutoff = `pow(${INVISIBLE} / max(var(--c3r-specular), ${INVISIBLE}), 1 / var(--c3r-shininess))`;
  const low = "var(--c3r-gradient-center) - var(--c3r-gradient-reach)";
  const high = "var(--c3r-gradient-center) + var(--c3r-gradient-reach)";
  return `--c3r-gradient-from: clamp(${low}, ${cutoff}, ${high}); --c3r-gradient-to: clamp(${low}, 1, ${high}); background-image: linear-gradient(atan2(var(--c3r-gradient-x), calc(-1 * var(--c3r-gradient-y))), ${stops.join()});`;
})();

const insertHighlightRules = (
  acc: VectorFold,
  polygon: string,
  flat: CssValue,
) => {
  // Its position and size are the content's, which map it like the texture
  insertRule(
    `${polygon} ${CONTENT}::after`,
    acc,
    `{ ${PSEUDO} mask-image: var(--c3r-specular-map); mask-mode: luminance; mask-position: inherit; mask-size: inherit; }`,
  );
  // White over the encoded color screens it, which over black is the exact add
  insertRule(
    `${polygon}:not(.c3r-smooth) ${CONTENT}::after`,
    acc,
    `{ --c3r-specular: ${textOf(flat)}; background-color: ${encoded("var(--c3r-specular)")}; }`,
  );
};

let lights: VectorFold | undefined;
let halves: VectorFold | undefined;
let pointFolds: [VectorFold, Accumulator] | undefined;
let views: VectorFold | undefined;

function createLights(): VectorFold {
  const acc = libraryAccumulator<CssVector, CssMatrix>({
    ...FOLD,
    name: "c3r-to-light",
    start: toLightAtView,
    combine: (parent, input) => rounded(input.transform(parent), 1 / 1024),
    input: lightInput,
  });
  const diffuse = CssValue.mul(
    light("diffuse"),
    CssValue.fn("max", 0, faceNormal.dot(acc.result)),
  );
  const shade = shadeOf(diffuse);
  // So a nested container doesn't take the lights of the one around it
  insertRule(
    ".c3r-container",
    acc,
    `{ ${[
      "ambient",
      "diffuse",
      "x",
      "y",
      "z",
      "point-x",
      "point-y",
      "point-z",
      "intensity",
    ]
      .map((name) => `--c3r-light-${name}: 0;`)
      .join(" ")} --c3r-diffuse-map: none; }`,
  );
  const polygon = `.c3r-polygon.${acc.className}`;
  insertRule(`${polygon} ${CONTENT}`, acc, "{ --c3r-shaded: alpha; }");
  insertRule(`${polygon} ${CONTENT}::before`, acc, `{ ${PSEUDO} }`);
  // Opaque under a transparent texel, so the mask applies its alpha once
  insertRule(
    `${polygon}:not(.c3r-smooth) ${CONTENT}`,
    acc,
    "{ --c3r-flat-backdrop: var(--c3r-shade-backdrop, white); }",
  );
  // Black over the encoded color multiplies it by the encoded light, a gradient
  // layer paints the same at several times the cost in Firefox
  insertRule(
    `${polygon}:not(.c3r-smooth) ${CONTENT}::before`,
    acc,
    `{ --c3r-shade: ${textOf(shade)}; background-color: rgb(0 0 0 / calc(1.055 * (1 - pow(var(--c3r-shade), 1 / 2.4)))); }`,
  );
  insertRule(
    `${polygon}.c3r-smooth ${CONTENT}::before`,
    acc,
    `{ ${gradientFields(acc.result)} }`,
  );
  const ambient = "var(--c3r-map-ambient)";
  const register = registerOn(acc);
  register("map-ambient");
  register("map-flat");
  insertRule(
    `${polygon}:is(.c3r-diffuse-mapped, .c3r-planar) ${CONTENT}::before`,
    acc,
    `{ --c3r-map-ambient: ${encode("var(--c3r-light-ambient)")}; }`,
  );
  insertRule(
    `${polygon}.c3r-diffuse-mapped:not(.c3r-smooth) ${CONTENT}::before`,
    acc,
    `{ --c3r-map-flat: ${mapLevel("var(--c3r-shade)", ambient)}; mix-blend-mode: multiply; background-color: transparent; ${mappedLight(ambient, `linear-gradient(${gray("var(--c3r-map-flat)")}, ${gray("var(--c3r-map-flat)")})`)} }`,
  );
  const from = "var(--c3r-gradient-from)";
  const to = "var(--c3r-gradient-to)";
  const center = "var(--c3r-gradient-center)";
  const stops = Array.from({ length: DIFFUSE_MAP_STOPS }, (_, i) => {
    // Dense where the encoding is steep, at the low end
    const at = `(${from} + (${to} - ${from}) * ${(i / (DIFFUSE_MAP_STOPS - 1)) ** 2.4})`;
    const shade = `clamp(var(--c3r-shade-low), var(--c3r-shade-low) + var(--c3r-light-diffuse) * ${at}, var(--c3r-shade-high))`;
    return `${gray(mapLevel(shade, ambient))} calc((${at} - ${center} + var(--c3r-gradient-reach)) / var(--c3r-gradient-length) * 1px)`;
  }).join();
  insertRule(
    `${polygon}.c3r-diffuse-mapped.c3r-smooth:not(.c3r-planar) ${CONTENT}::before`,
    acc,
    `{ ${mappedLight(ambient, `linear-gradient(atan2(var(--c3r-gradient-x), calc(-1 * var(--c3r-gradient-y))), ${stops})`)} }`,
  );
  return acc;
}

// Finer than the light's, a high shininess would show the steps
const cameraFold = (name: string, start: CssVector): VectorFold =>
  libraryAccumulator<CssVector, CssMatrix>({
    ...FOLD,
    name,
    start,
    combine: (parent) =>
      rounded(inputsOf("c3r-to-light").transform(parent), 1 / 4096),
    input: cameraInput,
  });

// Its own fold, so a camera move restyles only the polygons with a highlight.
// The halfway vector turns like the light, so groups share the light's inputs and
// only the camera writes its own, which the seed reads
function createHalves(toLight: CssVector): VectorFold {
  const toView = inputsOf("c3r-to-half").transform(new CssVector([0, 0, 1]));
  const acc = cameraFold("c3r-to-half", toLightAtView.add(toView).normalize());
  const toHalf = acc.result;
  const strength = CssValue.mul(light("diffuse"), specularIntensity);
  const flat = CssValue.mul(
    CssValue.mul(strength, unitDot(faceNormal, toLight)),
    CssValue.fn("pow", unitDot(faceNormal, toHalf), shininess),
  );
  const polygon = `.c3r-polygon.${acc.className}`;
  insertHighlightRules(acc, polygon, flat);
  // n·l changes along the line too, one per pixel would take a second gradient
  const lightAlong = (name: string) => fieldVector(name).dot(toLight);
  const slope = CssValue.div(
    CssValue.add(
      CssValue.mul(lightAlong("x"), cssVar("--c3r-gradient-x", "<number>")),
      CssValue.mul(lightAlong("y"), cssVar("--c3r-gradient-y", "<number>")),
    ),
    CssValue.fn("pow", cssVar("--c3r-gradient-length", "<number>"), 2),
  );
  insertRule(
    `${polygon}.c3r-smooth ${CONTENT}::after`,
    acc,
    `{ ${gradientFields(toHalf)} --c3r-specular: ${textOf(strength)}; --c3r-specular-lit: ${textOf(lightAlong("center"))}; --c3r-specular-slope: ${textOf(slope)}; ${POWER_CURVE} }`,
  );
  return acc;
}

const CORNERS = [0, 1, 2];

// Fields of the plane through the values at the three vertices
const interpolate = (out: string, name: string) =>
  ["center", "x", "y"]
    .map((k, row) => {
      const sum = CORNERS.map(
        (j) =>
          `var(--c3r-weight-${row * 3 + j}) * var(--c3r-vertex-${name}-${j})`,
      ).join(" + ");
      return `--c3r-${out}-${k}: calc(${sum});`;
    })
    .join(" ");

const perVertex = (
  name: string,
  value: (at: CssVector, normal: CssVector) => CssValue,
) =>
  CORNERS.map(
    (j) =>
      `--c3r-vertex-${name}-${j}: ${textOf(value(varVector(`c3r-vertex-${j}`), varVector(`c3r-vertex-normal-${j}`)))};`,
  ).join(" ");

const aboveOf = (height: string) => `max(${height}, ${TINY})`;

// On a plane, at a distance from the point below the light
const planeLight = (power: string, height: string, radius: string) =>
  `${power} * max(0, ${height}) / pow(hypot(${radius}, ${aboveOf(height)}), 3)`;

const safeUnit = (v: CssVector) =>
  v.scale(CssValue.div(1, CssValue.fn("max", v.length(), TINY)));

const registerOn =
  (owner: object) =>
  (name: string, syntax = "<number>", initial = "0") =>
    insertRule(
      `@property --c3r-${name}`,
      owner,
      `{ syntax: "${syntax}"; inherits: false; initial-value: ${initial}; }`,
    );

const pointTerms = ([position, powers]: [VectorFold, Accumulator]) => {
  const scaledLight = new CssVector(position.result.components.slice(0, 3));
  const scale = position.result.components[3];
  const toLightFrom = (at: CssVector) => scaledLight.sub(at.scale(scale));
  const offset = toLightFrom(varVector("c3r-plane-center"));
  const footAt = (axis: string) =>
    `${textOf(CssValue.div(varVector(`c3r-plane-${axis}`).dot(offset), scale))} * 1px`;
  return {
    scale,
    toLightFrom,
    offset,
    power: textOf(powers.result),
    lit: (at: CssVector, normal: CssVector) => {
      const l = toLightFrom(at);
      return CssValue.mul(
        powers.result,
        CssValue.div(
          normal.dot(l),
          CssValue.fn("pow", CssValue.fn("max", l.length(), TINY), 3),
        ),
      );
    },
    size: (radius: string, axis: string) =>
      `calc(${radius} / ${textOf(scale)} * var(--c3r-plane-scale-${axis}) * 1px)`,
    footAt,
    foot: (axis: string) => `calc(50% + ${footAt(axis)})`,
  };
};

function createPointFolds(): [VectorFold, Accumulator] {
  const acc = libraryAccumulator<CssVector, CssMatrix>({
    ...FOLD,
    name: "c3r-to-point",
    identity: new CssVector([0, 0, 0, 0]),
    inputIdentity: CssMatrix.identity(4),
    start: new CssVector([
      light("point-x"),
      light("point-y"),
      light("point-z"),
      1,
    ]),
    combine: (parent, input) => input.transform(parent),
    input: positionInput,
  });
  const powers = libraryAccumulator<CssValue>({
    name: "c3r-light-power",
    syntax: "<number>",
    identity: CssValue.number(0),
    inputIdentity: CssValue.number(1),
    start: light("intensity"),
    polygonsRead: true,
    combine: CssValue.mul,
    input: gainInput,
  });
  const { power, lit, offset, size, foot } = pointTerms([acc, powers]);
  const ambient = "var(--c3r-light-ambient)";
  const polygon = `.c3r-polygon.${acc.className}`;
  const register = registerOn(acc);
  insertRule(
    `${polygon}:not(.c3r-smooth) ${CONTENT}::before`,
    acc,
    `{ --c3r-shade: ${textOf(shadeOf(CssValue.fn("max", 0, lit(varVector("c3r-center"), faceNormal))))}; }`,
  );
  // Signed at the vertices and clamped per pixel, so edges and the terminator
  // stay continuous
  for (const j of CORNERS) register(`vertex-lit-${j}`);
  insertRule(
    `${polygon}.c3r-smooth:not(.c3r-planar) ${CONTENT}::before`,
    acc,
    `{ ${perVertex("lit", lit)} ${interpolate("gradient", "lit")} }`,
  );
  // Stops follow only the light and the plane, so coplanar neighbours draw the
  // same gradient. They span from where the shade saturates to where the light
  // can't be seen, evenly in the angle from the plane's normal
  const height = "var(--c3r-radial-height)";
  const above = aboveOf(height);
  const angleOf = (level: string) =>
    `acos(min(1, pow(${level} / max(${power} / pow(${above}, 2), 1e-9), 1 / 3)))`;
  const near = "var(--c3r-radial-near)";
  const far = "var(--c3r-radial-far)";
  const a = "var(--c3r-map-ambient)";
  const stops = Array.from({ length: POINT_STOPS }, (_, i) => i);
  const radius = (i: number) => `var(--c3r-radial-radius-${i})`;
  const reach = `max(${radius(POINT_STOPS - 1)}, ${TINY})`;
  register("radial-height");
  register("radial-near", "<angle>", "0rad");
  register("radial-far", "<angle>", "0rad");
  for (const i of stops) {
    register(`radial-radius-${i}`);
    register(`radial-level-${i}`);
  }
  const stopValues = stops
    .map((i) => {
      const shade = textOf(
        shadeOf(cssRaw(planeLight(power, height, radius(i)), "<number>")),
      );
      return `--c3r-radial-radius-${i}: calc(${above} * tan(${near} + (${far} - ${near}) * ${i / (POINT_STOPS - 1)})); --c3r-radial-level-${i}: ${mapLevel(shade, a)};`;
    })
    .join(" ");
  const gradientStops = stops
    .map(
      (i) =>
        `${gray(`var(--c3r-radial-level-${i})`)} calc(${radius(i)} / ${reach} * 100%)`,
    )
    .join();
  insertRule(
    `${polygon}.c3r-planar ${CONTENT}::before`,
    acc,
    `{ --c3r-radial-height: ${textOf(fieldVector("center").dot(offset))}; --c3r-radial-near: ${angleOf(`max(1 - ${ambient}, ${INVISIBLE})`)}; --c3r-radial-far: ${angleOf(String(INVISIBLE))}; ${stopValues} ${mappedLight(a, `radial-gradient(${size(reach, "u")} ${size(reach, "v")} at ${foot("u")} ${foot("v")}, ${gradientStops})`)} }`,
  );
  return [acc, powers];
}

const LIT_STOPS = 4;

// Its own fold like the halfway vector's, so a camera move restyles only the
// polygons with a highlight, and l̂ differs across a polygon so the two can't
// combine in the seed
function createViews(folds: [VectorFold, Accumulator]): VectorFold {
  const acc = cameraFold(
    "c3r-to-view",
    inputsOf("c3r-to-view").transform(new CssVector([0, 0, 1])),
  );
  const toView = acc.result;
  const {
    power,
    lit,
    toLightFrom,
    offset,
    scale,
    size: inPixels,
    footAt,
  } = pointTerms(folds);
  const size = (radius: string) => inPixels(radius, "u");
  const register = registerOn(acc);
  const half = (at: CssVector, normal: CssVector) => {
    const l = toLightFrom(at);
    const d = CssValue.fn("max", l.length(), TINY);
    const sum = l.scale(CssValue.div(1, d)).add(toView);
    return CssValue.div(
      normal.dot(sum),
      CssValue.fn("max", sum.length(), TINY),
    );
  };
  const polygon = `.c3r-polygon.${acc.className}`;
  insertHighlightRules(
    acc,
    `${polygon}:not(.c3r-planar)`,
    CssValue.mul(
      CssValue.mul(
        specularIntensity,
        CssValue.fn("max", 0, lit(varVector("c3r-center"), faceNormal)),
      ),
      CssValue.fn(
        "pow",
        CssValue.fn("clamp", 0, half(varVector("c3r-center"), faceNormal), 1),
        shininess,
      ),
    ),
  );

  // Both n·h and the light are linear through the shared vertex values, so
  // triangles agree along an edge. The light takes its own gradient, as it needn't
  // run along n·h
  for (const j of CORNERS) register(`vertex-half-${j}`);
  for (const name of ["center", "x", "y", "peak"]) register(`lit-${name}`);
  const [c, x, y, k] = ["center", "x", "y", "peak"].map(
    (name) => `var(--c3r-lit-${name})`,
  );
  const reach = `((abs(${x}) * var(--c3r-normal-width) + abs(${y}) * var(--c3r-normal-height)) / 2)`;
  const length = `max(hypot(${x}, ${y}), ${TINY})`;
  const from = `clamp(${c} - ${reach}, 0, ${c} + ${reach})`;
  const to = `clamp(${c} - ${reach}, ${k}, ${c} + ${reach})`;
  const litStops = Array.from({ length: LIT_STOPS }, (_, i) => {
    const at = `(${from} + (${to} - ${from}) * ${i / (LIT_STOPS - 1)})`;
    return `${encoded(`clamp(0, ${at} / ${k}, 1)`)} calc((${at} - ${c} + ${reach}) / ${length} * 1px)`;
  }).join();
  insertRule(
    `${polygon}.c3r-smooth:not(.c3r-planar) ${CONTENT}::after`,
    acc,
    `{ ${perVertex("lit", lit)} ${perVertex("half", half)} ${interpolate("gradient", "half")} ${interpolate("lit", "lit")} --c3r-lit-peak: max(var(--c3r-vertex-lit-0), var(--c3r-vertex-lit-1), var(--c3r-vertex-lit-2), ${TINY}); --c3r-specular: calc(var(--c3r-specular-intensity) * ${k}); --c3r-specular-lit: 1; --c3r-specular-slope: 0; ${POWER_CURVE} mask-image: linear-gradient(atan2(${x}, calc(-1 * ${y})), ${litStops}), var(--c3r-specular-layer); mask-composite: intersect; mask-mode: alpha, luminance; mask-repeat: no-repeat, repeat; mask-size: 100% 100%, var(--c3r-uv-size, 100% 100%); mask-position: 0 0, var(--c3r-uv-position, 0 0); }`,
  );

  // A plane has no vertices near the peak, which lies h·tan(view) along the view's
  // direction from the point below the light. Around it n·h = cos ψ falls on an
  // ellipse of h·tan(2ψ), longer by 1 / cos²(view) along that direction. The falloff
  // is a circle around the point below the light, on the same axis
  const height = "var(--c3r-glint-height)";
  const above = aboveOf(height);
  const view = "var(--c3r-glint-view)";
  const spread = "var(--c3r-glint-spread)";
  const peak = "var(--c3r-glint-peak)";
  const sh = textOf(shininess);
  const [eu, ev] = ["eu", "ev"].map((name) => `var(--c3r-glint-${name})`);
  const normal = fieldVector("center");
  const facing = normal.dot(toView);
  const unit = safeUnit(toView.sub(normal.scale(facing)));
  for (const name of ["height", "eu", "ev", "peak", "front"])
    register(`glint-${name}`);
  for (const name of ["view", "spread"])
    register(`glint-${name}`, "<angle>", "0rad");
  const psi = (i: number) => `(${spread} * ${i / (POINT_STOPS - 1)})`;
  const shortest = `${above} * tan(2 * ${spread})`;
  const longest = `${shortest} / pow(cos(${view}), 2)`;
  const away = `${above} * tan(${view})`;
  const levelStops = Array.from({ length: POINT_STOPS }, (_, i) => {
    // Fades out when the spread ends before the light does, a hard edge would show
    const value = `min(1, ${peak} * pow(cos(${psi(i)}), ${sh})) * ${1 - (i / (POINT_STOPS - 1)) ** 4}`;
    return `${encoded(value)} calc(tan(2 * ${psi(i)}) / tan(2 * ${spread}) * 100%)`;
  }).join();
  // Nothing from behind, where the oval would still draw at the clamped angle
  const strength = `var(--c3r-specular-intensity) * ${power} * var(--c3r-glint-front)`;
  const lightAt = (r: string) => planeLight(strength, height, r);
  const falloffRadius = (i: number) =>
    `${above} * tan(${(i / (POINT_STOPS - 1)) * 85}deg)`;
  const falloffStops = Array.from(
    { length: POINT_STOPS },
    (_, i) =>
      `${encoded(`min(1, ${lightAt(falloffRadius(i))} / ${peak})`)} calc(${falloffRadius(i)} / (${above} * tan(85deg)) * 100%)`,
  ).join();
  insertRule(
    `${polygon} ${CONTENT} > .c3r-polygon-glint`,
    acc,
    `{ position: absolute; inset: 0; pointer-events: none; mask-image: var(--c3r-specular-map); mask-mode: luminance; mask-size: var(--c3r-uv-size, 100% 100%); mask-position: var(--c3r-uv-position, 0 0); }`,
  );
  insertRule(
    `${polygon} ${CONTENT} > .c3r-polygon-glint::after`,
    acc,
    `{ ${PSEUDO} --c3r-glint-front: clamp(0, ${textOf(facing)} * 1000, 1); --c3r-glint-height: ${textOf(normal.dot(offset))}; --c3r-glint-view: min(acos(clamp(0, ${textOf(facing)}, 1)), 84deg); --c3r-glint-eu: ${textOf(varVector("c3r-plane-u").dot(unit))}; --c3r-glint-ev: ${textOf(varVector("c3r-plane-v").dot(unit))}; --c3r-glint-peak: max(1, ${lightAt(away)}); --c3r-glint-spread: max(0.01deg, min(acos(pow(${INVISIBLE} / max(${peak}, ${INVISIBLE}), 1 / ${sh})), 40deg)); inset: 0 auto auto 0; width: ${size(`2 * ${longest}`)}; height: ${size(`2 * ${shortest}`)}; transform-origin: 0 0; transform: translate(calc(var(--c3r-width) / 2 + ${footAt("u")} + ${away} / ${textOf(scale)} * ${eu} * 1px), calc(var(--c3r-height) / 2 + ${footAt("v")} + ${away} / ${textOf(scale)} * ${ev} * 1px)) scale(1, calc(var(--c3r-plane-scale-v) / var(--c3r-plane-scale-u))) rotate(atan2(${ev} / var(--c3r-plane-scale-v), ${eu} / var(--c3r-plane-scale-u))) translate(-50%, -50%); background-image: radial-gradient(closest-side, ${levelStops}); mask-image: radial-gradient(circle ${size(`${above} * tan(85deg)`)} at calc(50% - ${size(away)}) 50%, ${falloffStops}); }`,
  );
  return acc;
}

export const setShaded = (
  polygon: Polygon,
  shading: Shading | null,
  specular: Specular | null,
  hasImage: boolean,
  point: boolean,
  diffuseMapped: boolean,
): void => {
  const lit = !!shading && point;
  const glossy = !!shading && !!specular?.intensity;
  setSmooth(
    polygon,
    shading === "smooth",
    hasImage || !!specular?.map || diffuseMapped,
    point,
    !!shading && diffuseMapped,
  );
  setGlint(polygon, lit && glossy);
  if (!lit) pointFolds?.forEach((fold) => fold.removeTarget(polygon));
  if (!lit || !glossy) views?.removeTarget(polygon);
  if (lit || !glossy) halves?.removeTarget(polygon);
  if (!shading) {
    lights?.removeTarget(polygon);
    return;
  }
  const fold = (lights ??= createLights());
  fold.addTarget(polygon);
  if (glossy && !point)
    (halves ??= createHalves(fold.result)).addTarget(polygon);
  if (lit) {
    const folds = (pointFolds ??= createPointFolds());
    folds.forEach((f) => f.addTarget(polygon));
    if (glossy) (views ??= createViews(folds)).addTarget(polygon);
  }
  if (shading === "smooth") return;
  if (point) {
    const { vertices } = polygon;
    const center = vec3.create();
    for (const { position } of vertices) vec3.add(center, center, position);
    vec3.scale(center, center, 1 / vertices.length);
    setVector(polygon.domElement.style, "c3r-center", center);
  }
  // A rotation and a uniform scale, so the third column is the normal
  const m = matrixOf(polygon);
  const normal = vec3.normalize(vec3.create(), [m[8], m[9], m[10]]);
  FACE.forEach((p, k) =>
    polygon.domElement.style.setProperty(p, String(normal[k])),
  );
};
