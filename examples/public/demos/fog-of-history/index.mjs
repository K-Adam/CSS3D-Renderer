import path from "node:path";
import { vec3 } from "gl-matrix";
import {
  happyC3R,
  load,
  normalOf,
  facesAny,
  addFlat,
  lit,
  rgb,
  hex,
  sub,
  dot,
  cross,
  cameraView,
  writePage,
} from "../../../demos.mjs";

const HERE = import.meta.dirname;
const { Container, Group, Transform } = await happyC3R();
const items = load(path.join(HERE, "hextris.json"));
const tiles = load(path.join(HERE, "hexmeta.json"));
const LIGHT = { ambient: 0.62, intensity: 0.62, direction: [-0.5, -1, -0.45] };
const EYE = [0, 780, 700];
const PORTRAIT_EYE = [0, 1560, 1400];
const FOCUS = [0, -30, 60];
const DOLLY = 600;
// The dolly moves the camera along its view, this far
const ZOOMED = vec3.scaleAndAdd(
  [],
  EYE,
  vec3.normalize([], vec3.sub([], FOCUS, EYE)),
  DOLLY,
);
// Clicking a tile pans the map half way to it
const panOf = (tile) => [tile.x * 0.5, tile.z * 0.5];

// The atlas samples as olive once flattened, grass wants the blue channel back
const regrade = (c) => {
  const [r, g, b] = rgb(c);
  return r > b * 1.8 && g >= r * 0.75
    ? hex([r * 0.58, g * 0.86, b * 1.15 + 14])
    : c;
};
// Luminance only, so the map's shape survives under the fog
const fogged = (c) => {
  const [r, g, b] = rgb(c);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return hex([34 + l * 0.42, 38 + l * 0.42, 48 + l * 0.46]);
};

// Camera tilt is fixed and it only pans and dollies, so a face turned away from these never shows
const PANS = [
  [0, 0],
  [300, 260],
  [-300, 260],
  [300, -260],
  [-300, -260],
];
const EXTREMES = [EYE, ZOOMED].flatMap((e) =>
  PANS.map(([x, z]) => [e[0] + x, e[1], e[2] + z]),
);

// A building is mostly small trim, so size says nothing about what holds it together.
// What goes is what its own mesh hides from every tile's pan, zoomed in and out.
const VIEWPOINTS = tiles.flatMap((tile) => {
  const [x, z] = panOf(tile);
  return [0, 0.5, 1].map((k) =>
    vec3.add([], vec3.lerp([], EYE, ZOOMED, k), [x, 0, z]),
  );
});
// A polygon's back isn't drawn, so only a face turned to the eye can block it
const blocks = (o, from, to) => {
  const d = sub(to, from);
  if (dot(o.n, d) <= 0) return false;
  const e1 = sub(o.p[1], o.p[0]);
  const e2 = sub(o.p[2], o.p[0]);
  const h = cross(d, e2);
  const a = dot(e1, h);
  const s = sub(from, o.p[0]);
  const u = dot(s, h) / a;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = dot(d, q) / a;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, q) / a;
  return t > 1e-4 && t < 1;
};
// A grid of points inside the triangle, lifted off it so it doesn't block itself
const SAMPLE_ROWS = 5;
const samplePoints = ({ p, n }) => {
  const out = [];
  for (let i = 0; i <= SAMPLE_ROWS; i++)
    for (let j = 0; j <= SAMPLE_ROWS - i; j++) {
      const w = [
        (i + 1 / 3) / (SAMPLE_ROWS + 1),
        (j + 1 / 3) / (SAMPLE_ROWS + 1),
      ];
      w.push(1 - w[0] - w[1]);
      out.push(
        [0, 1, 2].map(
          (a) => w[0] * p[0][a] + w[1] * p[1][a] + w[2] * p[2][a] + n[a] * 0.02,
        ),
      );
    }
  return out;
};
const unhidden = (tris) => {
  const all = tris.map((t) => ({ ...t, n: normalOf(t.p) }));
  return all.filter((t) =>
    samplePoints(t).some((s) =>
      VIEWPOINTS.some(
        (e) =>
          dot(t.n, sub(e, s)) > 0 &&
          !all.some((o) => o !== t && blocks(o, s, e)),
      ),
    ),
  );
};

const container = new Container();
container.camera.transform = Transform.targetTo(EYE, FOCUS);

const pan = new Group();
pan.domElement.classList.add("pan");
container.root.addChild(pan);

// Far tiles first: Firefox can fall back on document order
const tileGroups = new Map();
for (const tile of tiles.toSorted(
  (a, b) => Math.hypot(b.x, b.z - EYE[2]) - Math.hypot(a.x, a.z - EYE[2]),
)) {
  const g = new Group();
  pan.addChild(g);
  tileGroups.set(tile.tag, g);
}

const withTabStop = new Set();
const tileLink = (tile, color) => {
  const a = document.createElement("a");
  a.href = `#t${tile.tag}`;
  a.className = "t";
  a.setAttribute(
    "aria-label",
    `${tile.rim ? "Sea" : "Land"} tile ${tile.tag.replace("_", ", ")}`,
  );
  if (withTabStop.has(tile.tag)) a.tabIndex = -1;
  withTabStop.add(tile.tag);
  a.style.setProperty("--c", color);
  a.style.setProperty("--f", fogged(color));
  return a;
};

const tileByTag = new Map(tiles.map((tile) => [tile.tag, tile]));
const topOf = (t) => Math.max(...t.p.map((q) => q[1]));
for (const item of items) {
  const tile = tileByTag.get(item.tag);
  const facing = item.tris.filter((t) => facesAny(t.p, EXTREMES));
  const shown = item.name.startsWith("building_") ? unhidden(facing) : facing;
  const tris = shown.map((t) => ({
    p: t.p,
    c: lit(regrade(t.c), normalOf(t.p), LIGHT),
  }));
  // The tile's top comes first, it's the tab stop
  if (item.name.startsWith("hex_")) tris.sort((a, b) => topOf(b) - topOf(a));
  addFlat(tileGroups.get(item.tag), tris, (color) => tileLink(tile, color));
}

const targets = tiles.map((tile) => `<i id="t${tile.tag}"></i>`).join("");
const pans = tiles.map((tile) => {
  const [x, z] = panOf(tile);
  return `html:has(#t${tile.tag}:target) .pan{transform:translate3d(${(-x).toFixed(1)}px,0,${(-z).toFixed(1)}px)}`;
});
const scene = await container.toHTML();
const css = `:root{--dolly:${DOLLY * container.unitScale}px}
@media (orientation:portrait){.c3r-container.c3r-container>.c3r-view{${cameraView(PORTRAIT_EYE, FOCUS)}}}
${pans.join("\n")}`;
writePage(HERE, { css, targets, scene });
