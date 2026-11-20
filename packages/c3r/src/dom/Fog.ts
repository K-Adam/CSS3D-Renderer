import { mat4, type ReadonlyMat4 } from "gl-matrix";

import { Camera, viewMatrixOf } from "../css/Camera.js";
import { CssMatrix, CssVector } from "../css/CssMatrix.js";
import { type Arg, CssValue, cssRaw, cssVar, textOf } from "../css/CssValue.js";
import { insertRule } from "../css/styles.js";
import type { transformSteps } from "../css/Tween.js";

import { type Accumulator, libraryAccumulator } from "./Accumulator.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D } from "./Object3D.js";
import { type Polygon, setFogLayer } from "./Polygon.js";
import { CONTENT, stepsOf } from "./Shading.js";

type AnimatedStep = ReturnType<typeof transformSteps>[number];

// Shaped like an affine matrix's transpose: the translation is the bottom row
const transposedAffine = (m: readonly Arg[], t: readonly Arg[] = [0, 0, 0]) =>
  new CssMatrix([
    ...m.slice(0, 3),
    t[0],
    ...m.slice(3, 6),
    t[1],
    ...m.slice(6),
    t[2],
    0,
    0,
    0,
    1,
  ]);

// A plane goes through a step by the transpose of its matrix, and the other way
// by the transpose of its inverse
const planeStep = (
  { step, args }: AnimatedStep,
  inverse: boolean,
): CssMatrix => {
  if (step.moves)
    return transposedAffine(
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      args.map((arg) =>
        cssRaw(`calc(${inverse ? -1 : 1} * ${arg} / 1px)`, "<number>"),
      ),
    );
  if (!step.normal)
    throw new RangeError("Fog can't follow a Transform.matrix tween");
  // A rotation's normal matrix is the rotation itself
  if (step.rotates) {
    const r = step.normal(args);
    return transposedAffine((inverse ? r : r.transpose()).components);
  }
  const [x, y, z] = args.map((arg) => {
    const n = cssRaw(arg, "<number>");
    return inverse ? CssValue.div(1, n) : n;
  });
  return transposedAffine([x, 0, 0, 0, y, 0, 0, 0, z]);
};

const transposed = (m: ReadonlyMat4) =>
  new CssMatrix(mat4.transpose(mat4.create(), m));

// Camera space looks down -z
const CAMERA_PLANE = new CssVector([0, 0, -1, 0]);

// Into each group's space, exact under any affine transform so the depth stays
// in world units. Only the camera's pose folds down the chain, its tweens move
// the plane on the fog layers, so a camera move restyles those and nothing above
const planeInput = (node: Object3D | Camera): CssMatrix | null => {
  if (node instanceof Camera) return transposed(viewMatrixOf(node));
  if (!(node instanceof Group)) return null;
  return stepsOf(node.tween).reduce(
    (out, step) => planeStep(step, false).mul(out),
    transposed(matrixOf(node)),
  );
};

const STOPS = 6;

const position = (name: string) =>
  new CssVector(
    ["x", "y", "z"].map((k) =>
      cssVar(`--c3r-position-${name}-${k}`, "<number>"),
    ),
  );

const tweenedPlane = (camera: Camera): CssVector =>
  stepsOf(camera.tween)
    .reduce(
      (out, step) => out.mul(planeStep(step, true)),
      CssMatrix.identity(4),
    )
    .transform(CAMERA_PLANE);

const AXES = [0, 1, 2, 3];
const columnsOf = (v: CssVector) =>
  AXES.map((j) => new CssVector(v.components.slice(4 * j, 4 * j + 4)));

function createFog(): Accumulator<CssVector, CssMatrix> {
  // The four basis planes fold, as the fold is linear any plane the camera's
  // tweens make is then a sum of them
  const acc = libraryAccumulator<CssVector, CssMatrix>({
    name: "c3r-fog-plane",
    syntax: "<number>",
    identity: new CssVector(Array<number>(16).fill(0)),
    inputIdentity: CssMatrix.identity(4),
    start: new CssVector(CssMatrix.identity(4).components),
    polygonsRead: true,
    combine: (parent, input) =>
      new CssVector(
        columnsOf(parent).flatMap(
          (column) => input.transform(column).components,
        ),
      ),
    input: planeInput,
    camera: { size: 4, value: tweenedPlane },
  });
  // Each basis plane's depth fields hold still, so the polygon computes them
  // once and a camera move only weighs them on the fog layer
  const FIELDS = ["center", "x", "y"];
  const basisField = (field: string, j: number) => `--c3r-fog-${field}-${j}`;
  const basisFields = columnsOf(acc.result)
    .flatMap((column, j) => {
      const normal = new CssVector(column.components.slice(0, 3));
      return FIELDS.map((field) => {
        const along = normal.dot(position(field));
        const value =
          field === "center"
            ? CssValue.add(along, column.components[3])
            : along;
        return `${basisField(field, j)}: ${textOf(value)};`;
      });
    })
    .join(" ");
  const weighed = FIELDS.map(
    (field) =>
      `--c3r-fog-${field}: ${textOf(
        new CssVector(
          AXES.map((j) => cssVar(basisField(field, j), "<number>")),
        ).dot(acc.camera!),
      )};`,
  ).join(" ");
  for (const field of FIELDS)
    for (const j of AXES)
      insertRule(
        `@property ${basisField(field, j)}`,
        acc,
        `{ syntax: "<number>"; inherits: true; initial-value: 0; }`,
      );
  for (const name of [...FIELDS, "reach"])
    insertRule(
      `@property --c3r-fog-${name}`,
      acc,
      `{ syntax: "<number>"; inherits: false; initial-value: 0; }`,
    );
  // So a nested container doesn't take the fog of the one around it
  insertRule(
    ".c3r-container",
    acc,
    "{ --c3r-fog-color: 0 0 0; --c3r-fog-density: 0; }",
  );
  const polygon = `.c3r-polygon.${acc.className}`;
  insertRule(polygon, acc, `{ ${basisFields} }`);
  // The content's mask then cuts the fog out where a texture is transparent
  insertRule(`${polygon} ${CONTENT}`, acc, "{ --c3r-shaded: alpha; }");
  // Depth is linear across the face and the gradient line spans it exactly, so
  // even stops sample the falloff
  const stops = Array.from({ length: STOPS }, (_, i) => {
    const depth = `var(--c3r-fog-center) + var(--c3r-fog-reach) * ${(2 * i) / (STOPS - 1) - 1}`;
    return `rgb(var(--c3r-fog-color) / calc(1 - exp(-1 * max(0, ${depth}) * var(--c3r-fog-density)))) ${(100 * i) / (STOPS - 1)}%`;
  }).join();
  const follower = `${polygon} ${CONTENT} > .c3r-camera-follower`;
  // Above the highlight, and tinted by the content's filter like the rest of it
  insertRule(
    follower,
    acc,
    "{ position: absolute; inset: 0; z-index: 1; pointer-events: none; }",
  );
  insertRule(
    `${follower} > .c3r-polygon-fog`,
    acc,
    `{ position: absolute; inset: 0; ${weighed} --c3r-fog-reach: calc((abs(var(--c3r-fog-x)) * var(--c3r-width) + abs(var(--c3r-fog-y)) * var(--c3r-height)) / 2px); background-image: linear-gradient(atan2(var(--c3r-fog-x), calc(-1 * var(--c3r-fog-y))), ${stops}); }`,
  );
  return acc;
}

let fog: Accumulator<CssVector, CssMatrix> | undefined;

export const setFogged = (polygon: Polygon, fogged: boolean): void => {
  setFogLayer(polygon, fogged);
  if (fogged) (fog ??= createFog()).addTarget(polygon);
  else fog?.removeTarget(polygon);
};
