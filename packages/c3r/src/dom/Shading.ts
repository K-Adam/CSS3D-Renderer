import { mat3, vec3 } from "gl-matrix";

import type { Camera } from "../css/Camera.js";
import { CssMatrix, CssVector } from "../css/CssMatrix.js";
import { CssValue, cssVar, textOf } from "../css/CssValue.js";
import { layerText } from "../css/Filter.js";
import { insertRule } from "../css/styles.js";
import { transformSteps } from "../css/Tween.js";

import { type Accumulator, libraryAccumulator } from "./Accumulator.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D } from "./Object3D.js";
import type { Polygon } from "./Polygon.js";

// A unit determinant spares normalizing per polygon, exact under rotation and
// uniform scale
function staticNormal(node: Object3D): CssMatrix {
  const m = mat3.normalFromMat4(mat3.create(), matrixOf(node));
  if (!m) return CssMatrix.identity(3);
  const size = Math.cbrt(Math.abs(mat3.determinant(m)));
  return new CssMatrix(mat3.multiplyScalar(m, m, 1 / size));
}

// (N n)·l = n·(Nᵀ l), so the light moves into the node's space
function lightInput(node: Object3D | Camera): CssMatrix | null {
  if (!(node instanceof Group)) return null;
  return [node.tween ?? []]
    .flat()
    .flatMap((t) => transformSteps(t))
    .reduce(
      (out, { step, args }) => (step.normal ? out.mul(step.normal(args)) : out),
      staticNormal(node),
    )
    .transpose();
}

const FACE = ["--c3r-face-x", "--c3r-face-y", "--c3r-face-z"];

const light = (name: string) => cssVar(`--c3r-light-${name}`, "<number>");

type LightFold = Accumulator<CssVector, CssMatrix>;

let lights: LightFold | undefined;

function createLights(): LightFold {
  const acc = libraryAccumulator<CssVector, CssMatrix>({
    name: "c3r-to-light",
    syntax: "<number>",
    identity: new CssVector([0, 0, 0]),
    start: new CssVector(["x", "y", "z"].map(light)),
    inputIdentity: CssMatrix.identity(3),
    combine: (parent, input) => input.transform(parent),
    input: lightInput,
    polygonsRead: true,
  });
  const face = new CssVector(FACE.map((p) => cssVar(p, "<number>")));
  const diffuse = CssValue.mul(
    light("diffuse"),
    CssValue.fn("max", 0, face.dot(acc.result)),
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
  // Linear, so the multiply is close to light times albedo after encoding
  const gray = "var(--c3r-shade)";
  const layer = layerText(`color(srgb-linear ${gray} ${gray} ${gray})`);
  insertRule(
    `.c3r-polygon.${acc.className} > .c3r-polygon-clip > .c3r-polygon-content`,
    acc,
    `{ --c3r-shade: ${textOf(shade)}; --c3r-shade-layer: ${layer}; --c3r-shaded: alpha; }`,
  );
  return acc;
}

export const setShaded = (polygon: Polygon, shaded: boolean): void => {
  if (!shaded) {
    lights?.removeTarget(polygon);
    return;
  }
  (lights ??= createLights()).addTarget(polygon);
  // A rotation and a uniform scale, so the third column is the normal
  const m = matrixOf(polygon);
  const normal = vec3.normalize(vec3.create(), [m[8], m[9], m[10]]);
  FACE.forEach((p, k) =>
    polygon.domElement.style.setProperty(p, String(normal[k])),
  );
};
