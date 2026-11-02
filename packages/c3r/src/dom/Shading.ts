import { mat3, vec3 } from "gl-matrix";

import type { Camera } from "../css/Camera.js";
import { CssMatrix, CssVector } from "../css/CssMatrix.js";
import { CssValue, cssVar, textOf } from "../css/CssValue.js";
import type { Shading } from "../css/Material.js";
import { insertRule } from "../css/styles.js";
import { transformSteps } from "../css/Tween.js";

import { type Accumulator, libraryAccumulator } from "./Accumulator.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D } from "./Object3D.js";
import { type Polygon, setSmooth } from "./Polygon.js";

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

const fieldVector = (name: string) =>
  new CssVector(
    ["x", "y", "z"].map((k) => cssVar(`--c3r-normal-${name}-${k}`, "<number>")),
  );

type LightFold = Accumulator<CssVector, CssMatrix>;

let lights: LightFold | undefined;

function createLights(): LightFold {
  const acc = libraryAccumulator<CssVector, CssMatrix>({
    name: "c3r-to-light",
    syntax: "<number>",
    identity: new CssVector([0, 0, 0]),
    start: new CssVector(["x", "y", "z"].map(light)),
    inputIdentity: CssMatrix.identity(3),
    // A change too small to see stops here instead of restyling the subtree
    combine: (parent, input) => {
      const moved = input.transform(parent);
      return moved.withComponents(
        moved.components.map((c) => CssValue.fn("round", c, 1 / 1024)),
      );
    },
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
  const polygon = `.c3r-polygon.${acc.className}`;
  const content = "> .c3r-polygon-clip > .c3r-polygon-content";
  insertRule(`${polygon} ${content}`, acc, "{ --c3r-shaded: alpha; }");
  insertRule(
    `${polygon} ${content}::before`,
    acc,
    '{ content: ""; position: absolute; inset: 0; pointer-events: none; }',
  );
  // Opaque under a transparent texel, so the mask applies its alpha once
  insertRule(
    `${polygon}:not(.c3r-smooth) ${content}`,
    acc,
    "{ --c3r-flat-backdrop: var(--c3r-shade-backdrop, white); }",
  );
  // Black over the encoded color multiplies it by the encoded light, a gradient
  // layer paints the same at several times the cost in Firefox
  insertRule(
    `${polygon}:not(.c3r-smooth) ${content}::before`,
    acc,
    `{ --c3r-shade: ${textOf(shade)}; background-color: rgb(0 0 0 / calc(1.055 * (1 - pow(var(--c3r-shade), 1 / 2.4)))); }`,
  );
  const along = (name: string) => textOf(fieldVector(name).dot(acc.result));
  insertRule(
    `${polygon}.c3r-smooth ${content}::before`,
    acc,
    `{ --c3r-gradient-x: ${along("x")}; --c3r-gradient-y: ${along("y")}; --c3r-gradient-center: ${along("center")}; }`,
  );
  return acc;
}

export const setShaded = (
  polygon: Polygon,
  shading: Shading | null,
  hasImage: boolean,
): void => {
  setSmooth(polygon, shading === "smooth", hasImage);
  if (!shading) {
    lights?.removeTarget(polygon);
    return;
  }
  (lights ??= createLights()).addTarget(polygon);
  if (shading === "smooth") return;
  // A rotation and a uniform scale, so the third column is the normal
  const m = matrixOf(polygon);
  const normal = vec3.normalize(vec3.create(), [m[8], m[9], m[10]]);
  FACE.forEach((p, k) =>
    polygon.domElement.style.setProperty(p, String(normal[k])),
  );
};
