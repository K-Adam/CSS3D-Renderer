import { mat3, type ReadonlyMat4, vec3 } from "gl-matrix";

import { Camera } from "../css/Camera.js";
import { CssMatrix, CssVector } from "../css/CssMatrix.js";
import { CssValue, cssVar, textOf } from "../css/CssValue.js";
import type { Shading, Specular } from "../css/Material.js";
import { insertRule } from "../css/styles.js";
import { composeTransforms } from "../css/Transform.js";
import { transformSteps, type Tween } from "../css/Tween.js";

import { type Accumulator, libraryAccumulator } from "./Accumulator.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D } from "./Object3D.js";
import { type Polygon, setSmooth } from "./Polygon.js";

// A unit determinant spares normalizing per polygon, exact under rotation and
// uniform scale
function staticNormal(matrix: ReadonlyMat4): CssMatrix {
  const m = mat3.normalFromMat4(mat3.create(), matrix);
  if (!m) return CssMatrix.identity(3);
  const size = Math.cbrt(Math.abs(mat3.determinant(m)));
  return new CssMatrix(mat3.multiplyScalar(m, m, 1 / size));
}

const normalOf = (
  matrix: ReadonlyMat4,
  tween: Tween | readonly Tween[] | null,
): CssMatrix =>
  [tween ?? []]
    .flat()
    .flatMap((t) => transformSteps(t))
    .reduce(
      (out, { step, args }) => (step.normal ? out.mul(step.normal(args)) : out),
      staticNormal(matrix),
    );

// (N n)·l = n·(Nᵀ l), so the light moves into the node's space
const lightInput = (node: Object3D | Camera): CssMatrix | null =>
  node instanceof Group
    ? normalOf(matrixOf(node), node.tween).transpose()
    : null;

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

const fieldVector = (name: string) =>
  new CssVector(
    ["x", "y", "z"].map((k) => cssVar(`--c3r-normal-${name}-${k}`, "<number>")),
  );

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
const SPECULAR_CUTOFF = 8e-4;

const encoded = (linear: string) =>
  `rgb(255 255 255 / clamp(0, 1.055 * pow(${linear}, 1 / 2.4) - 0.055, 1))`;

// A scale that isn't uniform leaves a fold longer than one, which a power of it
// would blow up
const unitDot = (a: CssVector, b: CssVector) =>
  CssValue.fn("clamp", 0, a.dot(b), 1);

const PSEUDO =
  'content: ""; position: absolute; inset: 0; pointer-events: none;';

let lights: VectorFold | undefined;
let halves: VectorFold | undefined;

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
  const shade = CssValue.fn(
    "clamp",
    0,
    CssValue.add(light("ambient"), diffuse),
    1,
  );
  // So a nested container doesn't take the lights of the one around it
  insertRule(
    ".c3r-container",
    acc,
    `{ ${["ambient", "diffuse", "x", "y", "z"]
      .map((name) => `--c3r-light-${name}: 0;`)
      .join(" ")} }`,
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
  return acc;
}

// Its own fold, so a camera move restyles only the polygons with a highlight.
// The halfway vector turns like the light, so groups share the light's inputs and
// only the camera writes its own, which the seed reads
function createHalves(toLight: CssVector): VectorFold {
  const toView = inputsOf("c3r-to-half").transform(new CssVector([0, 0, 1]));
  const acc = libraryAccumulator<CssVector, CssMatrix>({
    ...FOLD,
    name: "c3r-to-half",
    start: toLightAtView.add(toView).normalize(),
    // Finer than the light's, a high shininess would show the steps
    combine: (parent) =>
      rounded(inputsOf("c3r-to-light").transform(parent), 1 / 4096),
    input: cameraInput,
  });
  const toHalf = acc.result;
  const strength = CssValue.mul(
    light("diffuse"),
    cssVar("--c3r-specular-intensity", "<number>"),
  );
  const flat = CssValue.mul(
    CssValue.mul(strength, unitDot(faceNormal, toLight)),
    CssValue.fn(
      "pow",
      unitDot(faceNormal, toHalf),
      cssVar("--c3r-shininess", "<number>"),
    ),
  );
  const polygon = `.c3r-polygon.${acc.className}`;
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
  const from = "var(--c3r-gradient-from)";
  const to = "var(--c3r-gradient-to)";
  const stops = Array.from({ length: SPECULAR_STOPS }, (_, i) => {
    const at = `(${from} + (${to} - ${from}) * ${i / (SPECULAR_STOPS - 1)})`;
    const lit = `clamp(0, var(--c3r-specular-lit) + var(--c3r-specular-slope) * (${at} - var(--c3r-gradient-center)), 1)`;
    const linear = `var(--c3r-specular) * ${lit} * pow(clamp(0, ${at}, 1), var(--c3r-shininess))`;
    return `${encoded(linear)} calc((${at} - var(--c3r-gradient-center) + var(--c3r-gradient-reach)) / var(--c3r-gradient-length) * 1px)`;
  });
  const cutoff = `pow(${SPECULAR_CUTOFF} / max(var(--c3r-specular), ${SPECULAR_CUTOFF}), 1 / var(--c3r-shininess))`;
  const low = "var(--c3r-gradient-center) - var(--c3r-gradient-reach)";
  const high = "var(--c3r-gradient-center) + var(--c3r-gradient-reach)";
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
    `{ ${gradientFields(toHalf)} --c3r-specular: ${textOf(strength)}; --c3r-specular-lit: ${textOf(lightAlong("center"))}; --c3r-specular-slope: ${textOf(slope)}; --c3r-gradient-from: clamp(${low}, ${cutoff}, ${high}); --c3r-gradient-to: clamp(${low}, 1, ${high}); background-image: linear-gradient(atan2(var(--c3r-gradient-x), calc(-1 * var(--c3r-gradient-y))), ${stops.join()}); }`,
  );
  return acc;
}

export const setShaded = (
  polygon: Polygon,
  shading: Shading | null,
  specular: Specular | null,
  hasImage: boolean,
): void => {
  setSmooth(polygon, shading === "smooth", hasImage || !!specular?.map);
  if (!shading) {
    lights?.removeTarget(polygon);
    halves?.removeTarget(polygon);
    return;
  }
  const fold = (lights ??= createLights());
  fold.addTarget(polygon);
  if (specular?.intensity)
    (halves ??= createHalves(fold.result)).addTarget(polygon);
  else halves?.removeTarget(polygon);
  if (shading === "smooth") return;
  // A rotation and a uniform scale, so the third column is the normal
  const m = matrixOf(polygon);
  const normal = vec3.normalize(vec3.create(), [m[8], m[9], m[10]]);
  FACE.forEach((p, k) =>
    polygon.domElement.style.setProperty(p, String(normal[k])),
  );
};
