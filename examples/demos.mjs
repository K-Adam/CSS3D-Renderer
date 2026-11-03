// Each public/demos/<name>/index.mjs writes the page next to it. The pages run no script, so
// they are generated before Vite serves or copies them, and are not committed.
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Eta } from "eta";
import { mat4 } from "gl-matrix";
import { build } from "vite";

const DEMOS = resolve(import.meta.dirname, "public/demos");
const LAYOUT = resolve(import.meta.dirname, "demos.eta");

// From source when generation starts, a dev server picks up library edits on restart
const buildBundle = async () => {
  const outDir = mkdtempSync(join(tmpdir(), "c3r-"));
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      lib: {
        entry: resolve(import.meta.dirname, "../packages/c3r/src/C3R.ts"),
        name: "C3R",
        formats: ["umd"],
        fileName: () => "c3r.js",
      },
      outDir,
      minify: false,
    },
  });
  return join(outDir, "c3r.js");
};

let bundle;
// The plugin passes its build to each generator, which then skips its own
const c3rBundle = () =>
  (bundle ??= process.env.C3R_BUNDLE
    ? Promise.resolve(process.env.C3R_BUNDLE)
    : buildBundle());

// Set by happyC3R, for addFlat
let C3R;
// dir is served at /, for scenes that measure their images
export async function happyC3R(dir) {
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  GlobalRegistrator.register({
    url: "http://localhost/",
    settings: {
      enableIframePageLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
      ...(dir && {
        enableImageFileLoading: true,
        fetch: { virtualServers: [{ url: "/", directory: dir }] },
      }),
    },
  });
  const module = { exports: {} };
  new Function("module", "exports", readFileSync(await c3rBundle(), "utf8"))(
    module,
    module.exports,
  );
  return (C3R = module.exports);
}

export const load = (f) => JSON.parse(readFileSync(f, "utf8"));

// Writes <dir>/<name>.html from <dir>/<name>.eta, which can use the shared layout as "@layout"
export const writePage = (dir, data, name = "index") => {
  const eta = new Eta({ views: dir });
  eta.loadTemplate("@layout", readFileSync(LAYOUT, "utf8"));
  writeFileSync(join(dir, `${name}.html`), eta.render(name, data));
};

export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
};
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The value c3r gives a camera at eye looking at target, for CSS-only camera states
export const cameraView = (eye, target) => {
  const view = mat4.invert(
    mat4.create(),
    mat4.targetTo(mat4.create(), eye, target, [0, 1, 0]),
  );
  return `--c3r-camera-view:matrix3d(${[...view].map((v) => +v.toFixed(5)).join(",")})`;
};

// The faces of the box from lo to hi, each counterclockwise seen from outside
export const boxFaces = ([x0, y0, z0], [x1, y1, z1]) => ({
  "+z": [
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ],
  "-z": [
    [x1, y0, z0],
    [x0, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
  ],
  "+x": [
    [x1, y0, z1],
    [x1, y0, z0],
    [x1, y1, z0],
    [x1, y1, z1],
  ],
  "-x": [
    [x0, y0, z0],
    [x0, y0, z1],
    [x0, y1, z1],
    [x0, y1, z0],
  ],
  "+y": [
    [x0, y1, z1],
    [x1, y1, z1],
    [x1, y1, z0],
    [x0, y1, z0],
  ],
  "-y": [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
  ],
});
// A rectangle facing side, lo and hi share its coordinate along that axis
export const rect = (side, lo, hi) => boxFaces(lo, hi)[side];
export const normalOf = (p) => unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
// A face turned away from every eye can stay out of the DOM
export const facesAny = (pts, eyes) => {
  const n = normalOf(pts);
  return eyes.some((eye) => dot(n, sub(eye, pts[0])) > 0);
};
const areaOf = (p) =>
  Math.hypot(...cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2;
export const hex = (rgb) =>
  "#" +
  rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// c3r's flat shading sits in background-color, which the page's own color would replace.
// So the light is baked into the color, and it follows no later transform.
export const lit = (color, n, { ambient, intensity, direction }) => {
  const k = ambient + intensity * Math.max(0, -dot(n, unit(direction)));
  return hex(rgb(color).map((v) => v * k));
};

// Colors replace the atlas, so uvs only need to stay affine across a plane
export const toVertices = (p) => {
  // Rounded, so coplanar triangles get the same uv basis and can merge
  const n = unit(normalOf(p).map((x) => Math.round(x * 500) / 500));
  const a = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, n));
  const v = cross(n, u);
  return p.map((q) => ({
    position: q,
    uv: [dot(q, u) / 200, dot(q, v) / 200],
  }));
};

// One polygon per merged face, each with its own element from makeEl(color).
// With an eye, faces go in far to near: Firefox can fall back on document order.
export const addFlat = (group, tris, makeEl, eye) => {
  const byColor = new Map();
  for (const t of tris) {
    // Kits ship zero-area triangles, which have no plane
    if (areaOf(t.p) < 5e-4) continue;
    if (!byColor.has(t.c)) byColor.set(t.c, []);
    byColor.get(t.c).push(t.p);
  }
  const all = [...byColor].flatMap(([c, list]) =>
    new C3R.MeshBuilder([list.map(toVertices)], { uvTolerance: 100 })
      .faces(0)
      .map((f) => ({ ...f, c })),
  );
  if (eye) {
    const far = ({ vertices }) =>
      Math.max(...vertices.map((v) => Math.hypot(...sub(v.position, eye))));
    all.sort((a, b) => far(b) - far(a));
  }
  for (const { vertices, edges, c } of all) {
    // Slivers from kit meshes collapse to under 3 sides once simplified
    try {
      group.addPolygon(vertices, { contentElement: makeEl(c), edges });
    } catch {}
  }
};

const generate = async (name) => {
  const env = { ...process.env, C3R_BUNDLE: await c3rBundle() };
  const script = join(DEMOS, name, "index.mjs");
  return new Promise((res, rej) =>
    execFile(process.execPath, [script], { env }, (e, _, stderr) =>
      e ? rej(new Error(`${name}: ${stderr || e.message}`)) : res(),
    ),
  );
};
const demoNames = () =>
  readdirSync(DEMOS).filter((d) => existsSync(join(DEMOS, d, "index.mjs")));

// Sources directly in a demo folder. Not the page it writes, which would loop
const demoOfSource = (file) => {
  const [name, source, ...deeper] = relative(DEMOS, file).split(/[\\/]/);
  return !deeper.length && /\.(mjs|json|eta)$/.test(source) ? name : undefined;
};

export function demos() {
  return {
    name: "demos",
    // Before the build starts, its timings would count the wait on the generators
    async configResolved(config) {
      if (config.command === "build")
        await Promise.all(demoNames().map(generate));
    },
    configureServer(server) {
      const running = new Map();
      const regenerate = (name) => {
        const run = generate(name).catch((e) =>
          server.config.logger.error(e.message),
        );
        running.set(name, run);
        return run;
      };
      demoNames().forEach(regenerate);
      const reload = () => server.ws.send({ type: "full-reload" });
      server.watcher.on("change", (file) => {
        if (resolve(file) === LAYOUT) {
          Promise.all(demoNames().map(regenerate)).then(reload);
          return;
        }
        const name = demoOfSource(file);
        if (running.has(name)) regenerate(name).then(reload);
      });
      // A page asked for before it is written waits for it
      server.middlewares.use(async (req, _, next) => {
        const name = /^\/demos\/([^/]+)\//.exec(req.url)?.[1];
        if (running.has(name)) await running.get(name);
        next();
      });
    },
  };
}
