import type { ReadonlyMat4 } from "gl-matrix";

import { Camera, viewMatrixOf } from "../css/Camera.js";
import { CssValue, cssVar, matrixMultiply } from "../css/CssValue.js";
import { inverseStepValue, stepValue } from "../css/steps.js";
import { insertRule } from "../css/styles.js";
import { decompose } from "../css/Transform.js";
import { transformSteps, type Tween } from "../css/Tween.js";

import { type Accumulator, libraryAccumulator } from "./Accumulator.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D } from "./Object3D.js";

// Undoes the rotation and any mirror, keeps the scale. Null with shear or
// perspective, which have no rotation
function counterRotationOf(m: ReadonlyMat4): CssValue | null {
  const parts = decompose(m);
  if (!parts) return null;
  const { axis, angle, scale } = parts;
  const mirror = scale.some((n) => n < 0)
    ? CssValue.fn("scale3d", ...scale.map(Math.sign))
    : null;
  return matrixMultiply(
    mirror,
    CssValue.fn("rotate3d", ...axis, CssValue.rad(-angle)),
  );
}

const rotations = (tween: Tween | readonly Tween[] | null) =>
  [tween ?? []]
    .flat()
    .flatMap((t) => transformSteps(t))
    .filter(({ step }) => step.rotates);

// A group turns by its matrix then its tweens, so it counters them backwards.
// The view turns by the inverse of the camera, so it counters it forwards
function counterRotation(node: Object3D | Camera): CssValue {
  if (node instanceof Camera)
    return matrixMultiply(
      counterRotationOf(viewMatrixOf(node)),
      ...rotations(node.tween).map(({ step, args }) => stepValue(step, args)),
    );
  const tweens = node instanceof Group ? rotations(node.tween) : [];
  return matrixMultiply(
    ...tweens
      .toReversed()
      .map(({ step, args }) => inverseStepValue(step, args)),
    counterRotationOf(matrixOf(node)),
  );
}

let facing: Accumulator | undefined;

function createFacing(): Accumulator {
  const acc = libraryAccumulator({
    name: "c3r-facing",
    syntax: "<transform-list>",
    identity: CssValue.fn("rotate", CssValue.rad(0)),
    combine: (parent, input) => matrixMultiply(input, parent),
    input: counterRotation,
  });
  const identity = matrixMultiply();
  const transform = matrixMultiply(
    cssVar("--c3r-matrix", "<transform-list>", identity),
    cssVar("--c3r-tween-transform", "<transform-list>", identity),
    acc.result,
  );
  // After the base rules, so it wins over .c3r-group
  insertRule(".c3r-billboard", acc, `{ transform: ${transform}; }`);
  // A billboard already faces the camera, so a nested one only counters what
  // turns below it
  acc.restartUnder(".c3r-billboard");
  return acc;
}

export class Billboard extends Group {
  constructor() {
    super();
    this.domElement.classList.add("c3r-billboard");
    (facing ??= createFacing()).addTarget(this);
  }
}
