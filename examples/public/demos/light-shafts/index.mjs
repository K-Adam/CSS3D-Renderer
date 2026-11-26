import {
  boxFaces,
  facesAny,
  hex,
  happyC3R,
  normalOf,
  rect,
  rgb,
  writePage,
} from "../../../demos.mjs";

const HERE = import.meta.dirname;
const { Container, Material, Timeline, Transform, Tween } = await happyC3R();

// The nave spans x from -HALF_WIDTH to HALF_WIDTH, y from 0 to HEIGHT, z from BACK to FRONT
const HALF_WIDTH = 300;
const HEIGHT = 560;
const FRONT = 420;
const BAY = 300;
const BAYS = 8;
const BACK = -BAY * BAYS;
const EYE = [30, 180, 300];
// How far scrolling walks the camera down the nave
const DOLLY = 1300;
const END_EYE = [EYE[0], EYE[1], EYE[2] - DOLLY];

const PILLAR_X = 185;
const PILLAR_HALF = 32;
const RIB = 40;
// A pointed window on the left of every bay but the last, z measured from the bay's pillars
const WINDOW = { z: -150, half: 80, sill: 260, spring: 400 };
// Sunlight moves this far across the nave for each unit it falls. It never runs along the nave,
// so every slice of a beam is a plane facing the camera
const RUN = 0.93;
// Across the window, where the beam is sliced and where the dust hangs
const BEAM_SLICES = [-72, -48, -20, 20, 48, 72];
const DUST_PLANES = [-34, 34];
const MOTES_PER_PLANE = 46;

const STONE = "#433b33";
const FLOOR = "#312b25";
const FOG = "#1c2130";
const FOG_LENGTH = 1100;
const AMBIENT = 0.7;
const SUN_FILL = 0.35;
// The glass shines through the fog, so it takes on only this much of it
const GLASS_FOG = 0.3;
// Each light's alpha before the fog dims it
const ALPHA = {
  beam: 0.11,
  pool: 0.34,
  bounce: 0.2,
  haloWindow: 0.3,
  haloPool: 0.2,
};
// A plane fades out over this distance before the camera reaches it, else it would pop
const FADE = [260, 70];
// Soft planes need few pixels, opaque faces keep the library's size so their edges stay crisp
const SOFT_PX = () => 256;

const BAY_ZS = Array.from({ length: BAYS }, (_, k) => -k * BAY);
const SHEET_ZS = BAY_ZS.map((z) => z + WINDOW.z);
const WINDOW_ZS = SHEET_ZS.slice(0, -1);

const fogAmount = (z) => 1 - Math.exp(-Math.max(0, EYE[2] - z) / FOG_LENGTH);
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const dimmed = (alpha, z) => alpha * (1 - 0.75 * fogAmount(z));
const sunlight = (alpha) => `rgb(255 214 166/${alpha.toFixed(3)})`;
const random = (lo, hi) => lo + Math.random() * (hi - lo);
const percent = (t) => `${(t * 100).toFixed(1)}%`;

// A pointed arch, s across it and y up, made of two arcs of radius twice the half width. Each
// point carries its uv in the arch's bounding box
const arch = (half, bottom, spring) => {
  const height = spring + Math.sqrt(3) * half - bottom;
  const right = Array.from({ length: 7 }, (_, i) => {
    const angle = (i / 6) * (Math.PI / 3);
    return [
      -half + 2 * half * Math.cos(angle),
      spring + 2 * half * Math.sin(angle),
    ];
  });
  const left = right
    .slice(0, -1)
    .map(([s, y]) => [-s, y])
    .reverse();
  return [[-half, bottom], [half, bottom], ...right, ...left].map(([s, y]) => ({
    s,
    y,
    uv: [(s + half) / (2 * half), (y - bottom) / height],
  }));
};

const container = new Container();
document.body.append(container.domElement);
container.camera.fov = 60;
container.camera.transform = [
  Transform.translate(EYE),
  Transform.rotateX(-0.06),
];
container.camera.tween = new Tween({
  keyframes: [Transform.translate([0, 0, -DOLLY])],
  timeline: new Timeline({ scroll: true }),
});
container.fog = { color: rgb(FOG).map((v) => v / 255), length: FOG_LENGTH };
// Weak since the sun only gets in through the windows, and along the beams so the window wall
// falls dark
container.lights = {
  ambient: { intensity: AMBIENT },
  directional: { direction: [RUN, -1, 0], intensity: SUN_FILL },
};
const surface = new Material();
surface.fog = true;
surface.shading = "flat";

const RECT_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const addFace = (
  points,
  uvs,
  className,
  { style = {}, html = "", domSize } = {},
) => {
  const content = document.createElement("div");
  content.className = className;
  for (const [name, value] of Object.entries(style))
    content.style.setProperty(name, value);
  content.innerHTML = html;
  const vertices = points.map((position, i) => ({ position, uv: uvs[i] }));
  return container.root.addPolygon(vertices, {
    contentElement: content,
    getDomSize: domSize,
  });
};
// Opaque faces, which the library lights and fades into the fog as the camera walks
const addSurface = (points, color, layers = "") => {
  const style = { "--bg": `${layers}linear-gradient(${color} 0 0)` };
  addFace(points, RECT_UV, "solid", { style }).material = surface;
};
// A plane facing the camera, faded out by scrolling before the camera passes it
const addVeil = (
  points,
  uvs,
  className,
  { style, html, domSize = SOFT_PX },
) => {
  const scrolled = (distance) =>
    percent((EYE[2] - points[0][2] - distance) / DOLLY);
  addFace(points, uvs, `${className} veil`, {
    style: {
      ...style,
      "--fade-start": scrolled(FADE[0]),
      "--fade-end": scrolled(FADE[1]),
    },
    html,
    domSize,
  });
};
const sheet = (z) => rect("+z", [-HALF_WIDTH, 0, z], [HALF_WIDTH, HEIGHT, z]);

// The hall, one segment per bay so the fog's few gradient stops stay close
const JOINTS =
  "repeating-linear-gradient(to right,#0000 0 23px,#0003 23px 25px),";
for (const [k, z0] of [...BAY_ZS, BACK].entries()) {
  const z1 = k ? z0 + BAY : FRONT;
  addSurface(
    rect("+y", [-HALF_WIDTH, 0, z0], [HALF_WIDTH, 0, z1]),
    FLOOR,
    JOINTS,
  );
  addSurface(
    rect("-y", [-HALF_WIDTH, HEIGHT, z0], [HALF_WIDTH, HEIGHT, z1]),
    STONE,
  );
  addSurface(
    rect("+x", [-HALF_WIDTH, 0, z0], [-HALF_WIDTH, HEIGHT, z1]),
    STONE,
  );
  addSurface(rect("-x", [HALF_WIDTH, 0, z0], [HALF_WIDTH, HEIGHT, z1]), STONE);
}
addSurface(
  rect("+z", [-HALF_WIDTH, 0, BACK], [HALF_WIDTH, HEIGHT, BACK]),
  STONE,
);

// Pillars, only the faces the camera sees on its walk
const pillarFaces = BAY_ZS.flatMap((z) =>
  [-PILLAR_X, PILLAR_X].flatMap((x) =>
    Object.entries(
      boxFaces(
        [x - PILLAR_HALF, 0, z - PILLAR_HALF],
        [x + PILLAR_HALF, HEIGHT - RIB, z + PILLAR_HALF],
      ),
    ),
  ),
);
for (const [side, points] of pillarFaces) {
  if (side.endsWith("y") || !facesAny(points, [EYE, END_EYE])) continue;
  // Light from the pools bounces up the sides facing the aisle
  const bounce = `linear-gradient(to top,${sunlight(ALPHA.bounce)},#0000 40%),`;
  addSurface(points, STONE, side === "+z" ? "" : bounce);
}

// A rib across the ceiling over each pair of pillars
for (const z of BAY_ZS) {
  const lo = [-HALF_WIDTH, HEIGHT - RIB, z - 20];
  const hi = [HALF_WIDTH, HEIGHT, z + 20];
  addSurface(rect("-y", lo, hi), STONE);
  addSurface(rect("+z", lo, hi), STONE);
}

// The door at the end, glowing through the last of the fog
const door = arch(110, 0, 300);
addFace(
  door.map(({ s, y }) => [s, y, BACK + 1]),
  door.map(({ uv }) => uv),
  "light",
  { style: { "--bg": "linear-gradient(to top,#ffd9a8,#fff4e0 60%)" } },
);
const DOOR_GLOWS = [
  [80, "radial-gradient(ellipse 36% 51% at 50% 72%,rgb(255 226 180/.4),#0000)"],
  [
    200,
    "radial-gradient(ellipse 63% 74% at 50% 67%,rgb(255 220 170/.18),#0000)",
  ],
];
for (const [distance, glow] of DOOR_GLOWS)
  addVeil(sheet(BACK + distance), RECT_UV, "glow", { style: { "--bg": glow } });

// Fog sheets, one in the middle of each bay. The puffs sit on a strip twice the sheet's width,
// each repeated every half so the drift loops. Plain gradients, an SVG noise image filters
// differently in each browser
const puff = () => {
  const [x, y] = [random(0, 50), random(45, 100)];
  const size = `${random(8, 18).toFixed(1)}% ${random(14, 30).toFixed(1)}%`;
  const color = `rgb(150 160 186/${random(0.1, 0.22).toFixed(2)})`;
  return [x - 50, x, x + 50, x + 100].map(
    (at) =>
      `radial-gradient(ellipse ${size} at ${at.toFixed(1)}% ${y.toFixed(1)}%,${color},#0000)`,
  );
};
const HAZE = "linear-gradient(rgb(150 160 186/.07),rgb(150 160 186/.07))";
// Lit by the window and by the pool below it
const windowHalo = (z) =>
  `radial-gradient(ellipse 27% 24% at 5% 45%,${sunlight(dimmed(ALPHA.haloWindow, z))},#0000),` +
  `radial-gradient(ellipse 31% 18% at 54.5% 100%,${sunlight(dimmed(ALPHA.haloPool, z))},#0000)`;
for (const z of SHEET_ZS) {
  addVeil(sheet(z), RECT_UV, "fog", {
    style: {
      "--puffs": [...Array.from({ length: 9 }, puff).flat(), HAZE].join(","),
      "--halo": WINDOW_ZS.includes(z) ? windowHalo(z) : "none",
      "--alpha": (1 - 0.4 * fogAmount(z)).toFixed(3),
      "--period": `${random(70, 110).toFixed(1)}s`,
      "--delay": `${random(-100, 0).toFixed(1)}s`,
    },
    html: '<div class="halo"></div><div class="puffs"></div>',
  });
}

// The windows, with a mullion and a transom
const windowArch = arch(WINDOW.half, WINDOW.sill, WINDOW.spring);
const MUNTINS =
  "linear-gradient(to right,#0000 48%,#2a2420 48% 52%,#0000 52%)," +
  "linear-gradient(to top,#0000 60%,#2a2420 60% 63%,#0000 63%),";
for (const z of WINDOW_ZS) {
  const [warm, pale] = ["#ffd7a0", "#fff5e2"].map((c) =>
    mix(c, FOG, GLASS_FOG * fogAmount(z)),
  );
  addFace(
    windowArch.map(({ s, y }) => [-HALF_WIDTH + 1, y, z - s]),
    windowArch.map(({ uv }) => uv),
    "light",
    { style: { "--bg": `${MUNTINS}linear-gradient(to top,${warm},${pale})` } },
  );
}

const apex = WINDOW.spring + Math.sqrt(3) * WINDOW.half;
// Height of the window's top at s across it
const windowTop = (s) =>
  WINDOW.spring +
  Math.sqrt((2 * WINDOW.half) ** 2 - (Math.abs(s) + WINDOW.half) ** 2);
const BEAM_X = -HALF_WIDTH;
// Where the ray leaving the window at height y lands on the floor
const landing = (y) => BEAM_X + y * RUN;
// Where the ray from the window's top lands, the far edge of the dust planes
const BEAM_RIGHT = landing(apex);

// Pools of light, the window's outline cast along the sunlight onto the floor
for (const z of WINDOW_ZS) {
  const points = windowArch.map(({ s, y }) => [landing(y), 1, z - s]);
  // The window's height runs along the sunlight on the floor
  const uvs = windowArch.map(({ uv: [u, v] }) => [v, u]);
  const facesUp = normalOf(points)[1] > 0;
  addFace(
    facesUp ? points : points.toReversed(),
    facesUp ? uvs : uvs.toReversed(),
    "pool",
    { style: { "--sun": sunlight(dimmed(ALPHA.pool, z)) } },
  );
}

// Beams. u is the height on the window a ray left from, v the height above the floor, so every
// ray fades towards the floor
const beamUv = ([x, y]) => [
  (apex - y - (x - BEAM_X) / RUN) / (apex - WINDOW.sill),
  y / apex,
];
const beams = WINDOW_ZS.flatMap((z) =>
  BEAM_SLICES.map((s, i) => ({
    z: z + s,
    top: windowTop(s),
    period: 5 + i * 1.3,
  })),
);
for (const { z, top, period } of beams) {
  const beam = [
    [BEAM_X, WINDOW.sill, z],
    [landing(WINDOW.sill), 0, z],
    [landing(top), 0, z],
    [BEAM_X, top, z],
  ];
  addVeil(beam, beam.map(beamUv), "shaft", {
    style: {
      "--alpha": dimmed(ALPHA.beam, z).toFixed(3),
      "--period": `${period.toFixed(1)}s`,
      "--delay": `${random(-14, 0).toFixed(1)}s`,
    },
    html: '<div class="rays"></div>',
  });
}

// Dust, on upright rectangles: the beams' own mapping is stretched along them and would smear
// each mote. A mote is a point of the window carried some way down its ray
const randomMote = (top, z) => {
  const height = random(WINDOW.sill + 10, top - 10);
  const drop = random(0.03, 0.92) * height;
  return {
    x: BEAM_X + drop * RUN,
    y: height - drop,
    size: `${random(3, 8).toFixed(1)}px`,
    alpha: (random(0.4, 1) * dimmed(1, z)).toFixed(2),
  };
};
const dustPlanes = WINDOW_ZS.flatMap((z) =>
  DUST_PLANES.map((s) => ({ z: z + s, top: windowTop(s) })),
);
for (const { z, top } of dustPlanes) {
  const motes = Array.from({ length: MOTES_PER_PLANE }, () =>
    randomMote(top, z),
  );
  const layers = motes.map(({ x, y, size, alpha }) => {
    const position = `${percent((x - BEAM_X) / (BEAM_RIGHT - BEAM_X))} ${percent(1 - y / apex)}`;
    return `radial-gradient(rgb(255 238 205/${alpha}),#0000 70%) ${position}/${size} ${size} no-repeat`;
  });
  addVeil(rect("+z", [BEAM_X, 0, z], [BEAM_RIGHT, apex, z]), RECT_UV, "dust", {
    style: {
      "--motes": layers.join(","),
      "--delay": `${random(-12, 0).toFixed(1)}s`,
    },
    // Motes are sized in pixels, so the planes keep one pixel density whatever their width
    domSize: (size) => size * 1.4,
    html: '<div class="motes"></div>',
  });
}

const scene = await container.toHTML();
writePage(HERE, {
  css: `:root{background:${FOG}}`,
  scene,
});
