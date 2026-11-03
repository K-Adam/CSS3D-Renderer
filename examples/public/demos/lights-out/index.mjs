import { mat4 } from "gl-matrix";
import {
  happyC3R,
  dot,
  sub,
  rect,
  facesAny,
  normalOf,
  writePage,
} from "../../../demos.mjs";

const HERE = import.meta.dirname;

// The page on the wall, before the scene loads it
writePage(HERE, {}, "frame");
const { Container, Group, Material, Transform, Tween, Billboard } =
  await happyC3R(HERE);

// The room spans x from -HALF_WIDTH to HALF_WIDTH, y from 0 to HEIGHT, z from BACK to FRONT
const HALF_WIDTH = 360;
const HEIGHT = 420;
const BACK = -300;
const FRONT = 400;
const EYE = [0, 210, FRONT - 20];
// How far scrolling moves the camera in, the side panels stay in view
const DOLLY = 140;

// The article spans x and y on the back wall. The videos face each other on the side walls,
// centred at SIDE_Z
const ARTICLE = { xs: [-280, 280], ys: [50, 390] };
const SIDE_Z = -140;
const VIDEO_HALF = 130;
const FILM_YS = [110, 290];
const TANK_YS = [110, 300];
// Width of a frame's bars, and their depth off the wall
const BAR = 12;

// The lamp goes round a square from LAMP, LEG seconds per side
const LAMP = [-200, 250, -220];
const ORBIT = [
  [0, 0, 0],
  [400, -40, 0],
  [400, -20, 400],
  [0, 40, 400],
  [0, 0, 0],
];
const LEG = 4.5;
const PERIOD = (ORBIT.length - 1) * LEG;

// The pillar slides along x and back once per period, this far behind the lamp, so the lamp
// crosses the pillar's line while the pillar is at the far end
const PILLAR_LAG = 6.75;
const PILLAR_X = -300;
const PILLAR_TRAVEL = 600;
const PILLAR_Z = -140;
const PILLAR_HALF = 30;

// Texture tile in world units, so steel keeps its proportions on any face
const TILE = 180;

const withUv = (pts, u = 1, v = 1) =>
  pts.map((position, i) => ({
    position,
    uv: [
      [0, 0],
      [u, 0],
      [u, v],
      [0, v],
    ][i],
  }));
const material = (background, shading) => {
  const m = new Material();
  if (background) m.background = background;
  if (shading) m.shading = shading;
  return m;
};
const dist = (a, b) => Math.hypot(...sub(a, b));
const addTiled = (group, faces) => {
  for (const pts of faces)
    group.addPolygon(
      withUv(pts, dist(pts[0], pts[1]) / TILE, dist(pts[1], pts[2]) / TILE),
    );
};

const container = new Container();
document.body.append(container.domElement);
const orbit = new Tween({
  keyframes: ORBIT.slice(1).map((t) => Transform.translate(t)),
  duration: LEG,
  easing: "ease-in-out",
  loop: true,
});
container.lights = {
  ambient: { intensity: 0.05 },
  point: { position: LAMP, intensity: 26000, tween: orbit },
};
container.camera.fov = 60;
container.camera.transform = Transform.translate(EYE);
const room = new Group();
container.root.addChild(room);

// Each surface in its own group, for the transform that sets it on a wall
const addSurface = (background, pts, [u, v], options, transform) => {
  const g = new Group();
  room.addChild(g);
  if (transform) g.transform = transform;
  g.material = material(background, "smooth");
  return g.addPolygon(withUv(pts, u, v), options);
};
const WALLPAPER = "assets/wall.jpg";
const backWall = addSurface(
  WALLPAPER,
  rect("+z", [-HALF_WIDTH, 0, BACK], [HALF_WIDTH, HEIGHT, BACK]),
  [2, 1],
);
const floor = addSurface(
  "assets/floor.jpg",
  rect("+y", [-HALF_WIDTH, 0, BACK], [HALF_WIDTH, 0, FRONT]),
  [2, 2],
);
const ceiling = addSurface(
  WALLPAPER,
  rect("-y", [-HALF_WIDTH, HEIGHT, BACK], [HALF_WIDTH, HEIGHT, FRONT]),
  [2, 2],
);
const leftWall = addSurface(
  WALLPAPER,
  rect("+x", [-HALF_WIDTH, 0, BACK], [-HALF_WIDTH, HEIGHT, FRONT]),
  [2, 1],
);
const rightWall = addSurface(
  WALLPAPER,
  rect("-x", [HALF_WIDTH, 0, BACK], [HALF_WIDTH, HEIGHT, FRONT]),
  [2, 1],
);

// Live markup on a panel, domSize pixels wide
const addPanel = (html, pts, domSize, transform) => {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return addSurface(
    [1, 1, 1, 1],
    pts,
    [1, 1],
    { contentElement: wrap, getDomSize: () => domSize },
    transform,
  );
};
const video = (id, src) =>
  `<video id="${id}" muted loop playsinline autoplay src="${src}"></video>`;
// A video centred on the origin, turned onto a side wall by its transform
const videoRect = ([y0, y1]) =>
  rect("+z", [-VIDEO_HALF, y0, 0], [VIDEO_HALF, y1, 0]);
const articlePanel = addPanel(
  `<iframe id="wallpage" src="frame.html" title="An article on the wall about live lighting without JavaScript"></iframe>`,
  rect(
    "+z",
    [ARTICLE.xs[0], ARTICLE.ys[0], BACK + 1],
    [ARTICLE.xs[1], ARTICLE.ys[1], BACK + 1],
  ),
  700,
);
const filmPanel = addPanel(
  video("film", "assets/candle.webm"),
  videoRect(FILM_YS),
  520,
  [
    Transform.translate([HALF_WIDTH - 1, 0, SIDE_Z]),
    Transform.rotateY(-Math.PI / 2),
  ],
);
const tankPanel = addPanel(
  video("tank", "assets/aquarium.webm"),
  videoRect(TANK_YS),
  520,
  [
    Transform.translate([-HALF_WIDTH + 1, 0, SIDE_Z]),
    Transform.rotateY(Math.PI / 2),
  ],
);

const frames = new Group();
room.addChild(frames);
frames.material = material("assets/pillar.jpg", "flat");
// Flat shades a polygon at its center, which would set the mitred pieces of one plane apart
const frameFronts = new Group();
frames.addChild(frameFronts);
frameFronts.material = material("assets/pillar.jpg", "smooth");
// A mitred frame around a panel spanning a0..a1 along x, or along z when sideways. Its back is
// on the wall, its front BAR towards the room, fromWall being +1 or -1
const addFrame = ([a0, a1], [y0, y1], wall, fromWall, sideways) => {
  const face = wall + fromWall * BAR;
  const [A0, A1, Y0, Y1] = [a0 - BAR, a1 + BAR, y0 - BAR, y1 + BAR];
  const toRoom = ([a, y, d]) => (sideways ? [d, y, a] : [a, y, d]);
  // Top, bottom, left and right, each from an outer edge to an inner one
  const fronts = [
    [
      [A0, Y1],
      [A1, Y1],
      [a1, y1],
      [a0, y1],
    ],
    [
      [A1, Y0],
      [A0, Y0],
      [a0, y0],
      [a1, y0],
    ],
    [
      [A0, Y0],
      [A0, Y1],
      [a0, y1],
      [a0, y0],
    ],
    [
      [A1, Y1],
      [A1, Y0],
      [a1, y0],
      [a1, y1],
    ],
  ].map((pts) => [[0, 0, fromWall], pts.map(([a, y]) => [a, y, face])]);
  // Each side reaches from the wall to the front along one edge, the outer four first
  const sides = [
    [
      [0, 1, 0],
      [A0, Y1],
      [A1, Y1],
    ],
    [
      [0, -1, 0],
      [A0, Y0],
      [A1, Y0],
    ],
    [
      [-1, 0, 0],
      [A0, Y0],
      [A0, Y1],
    ],
    [
      [1, 0, 0],
      [A1, Y0],
      [A1, Y1],
    ],
    [
      [0, -1, 0],
      [a0, y1],
      [a1, y1],
    ],
    [
      [0, 1, 0],
      [a0, y0],
      [a1, y0],
    ],
    [
      [1, 0, 0],
      [a0, y0],
      [a0, y1],
    ],
    [
      [-1, 0, 0],
      [a1, y0],
      [a1, y1],
    ],
  ].map(([out, from, to]) => [
    out,
    [
      [...from, wall],
      [...to, wall],
      [...to, face],
      [...from, face],
    ],
  ]);
  for (const [out, listed] of [...fronts, ...sides]) {
    // Counterclockwise seen from outside, which mapping to a side wall can mirror
    const corners =
      dot(normalOf(listed.map(toRoom)), toRoom(out)) < 0
        ? listed.toReversed()
        : listed;
    const pts = corners.map(toRoom);
    if (!facesAny(pts, [EYE])) continue;
    // Texture axes: a and y on the front, a and d on top and bottom, d and y on the left and right
    const [u, v] = out[2] ? [0, 1] : out[1] ? [0, 2] : [2, 1];
    (out[2] ? frameFronts : frames).addPolygon(
      corners.map((corner, i) => ({
        position: pts[i],
        uv: [corner[u] / TILE, corner[v] / TILE],
      })),
    );
  }
};
addFrame(ARTICLE.xs, ARTICLE.ys, BACK + 1, 1);
// The near bar stands off by its own depth, in line with the camera it would cover the panel's edge
const SIDE_SPAN = [SIDE_Z - VIDEO_HALF, SIDE_Z + VIDEO_HALF + BAR + 1];
addFrame(SIDE_SPAN, FILM_YS, HALF_WIDTH - 1, -1, true);
addFrame(SIDE_SPAN, TANK_YS, -HALF_WIDTH + 1, 1, true);

const addPillar = () => {
  // The track in floor and ceiling shows why the pillar moves
  const SLOT = 340;
  const slots = new Group();
  room.addChild(slots);
  slots.material = material([0.012, 0.012, 0.012, 1]);
  slots.addPolygon(
    withUv(rect("+y", [-SLOT, 1, PILLAR_Z - 9], [SLOT, 1, PILLAR_Z + 9])),
  );
  slots.addPolygon(
    withUv(
      rect(
        "-y",
        [-SLOT, HEIGHT - 1, PILLAR_Z - 9],
        [SLOT, HEIGHT - 1, PILLAR_Z + 9],
      ),
    ),
  );

  const pillar = new Group();
  room.addChild(pillar);
  pillar.tween = new Tween({
    keyframes: [Transform.translate([PILLAR_TRAVEL, 0, 0])],
    duration: PERIOD / 2,
    delay: PILLAR_LAG - PERIOD,
    easing: "ease-in-out",
    loop: true,
    alternate: true,
  });
  pillar.material = material("assets/pillar.jpg", "smooth");
  const COLLAR_HALF = PILLAR_HALF + 5;
  const COLLAR_H = 22;
  const shaftLo = [PILLAR_X - PILLAR_HALF, 0, PILLAR_Z - PILLAR_HALF];
  const shaftHi = [PILLAR_X + PILLAR_HALF, HEIGHT, PILLAR_Z + PILLAR_HALF];
  const collarX = [PILLAR_X - COLLAR_HALF, PILLAR_X + COLLAR_HALF];
  const collarZ = [PILLAR_Z - COLLAR_HALF, PILLAR_Z + COLLAR_HALF];
  // The camera never gets behind the pillar, each polygon costs style time every frame
  const visibleSides = (lo, hi) =>
    ["+z", "+x", "-x"].map((side) => rect(side, lo, hi));
  const collar = (y0, y1) =>
    visibleSides([collarX[0], y0, collarZ[0]], [collarX[1], y1, collarZ[1]]);
  // Front, left and right strips around the shaft. A whole cap would cut through the shaft, and
  // Firefox sorts it on top
  const ring = (y, side) => [
    rect(side, [collarX[0], y, shaftHi[2]], [collarX[1], y, collarZ[1]]),
    rect(side, [collarX[0], y, shaftLo[2]], [shaftLo[0], y, shaftHi[2]]),
    rect(side, [shaftHi[0], y, shaftLo[2]], [collarX[1], y, shaftHi[2]]),
  ];
  // Flat, smooth on these small faces cost about a third of the frame rate
  const collars = new Group();
  pillar.addChild(collars);
  collars.material = material(null, "flat");
  addTiled(pillar, visibleSides(shaftLo, shaftHi));
  addTiled(collars, [
    ...collar(0, COLLAR_H),
    ...ring(COLLAR_H, "+y"),
    ...collar(HEIGHT - COLLAR_H, HEIGHT),
    ...ring(HEIGHT - COLLAR_H, "-y"),
  ]);
};
addPillar();

const lamp = new Group();
container.root.addChild(lamp);
lamp.tween = orbit;
const sprite = new Billboard();
lamp.addChild(sprite);
sprite.transform = Transform.translate(LAMP);
sprite.addPolygon(withUv(rect("+z", [-30, -30, 0], [30, 30, 0])));
sprite.material = material("assets/lamp.png");

// The shadows are keyframed clip-paths, sampled from the motion the tweens play.
// CSS ease-in-out, solved for its x
const ease = (x) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    const bx =
      3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t * t * 0.58 + t ** 3;
    if (bx < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) * t * t + t ** 3;
};
const lampAt = (t) => {
  const u = t % PERIOD;
  const i = Math.floor(u / LEG);
  const k = ease((u - i * LEG) / LEG);
  return LAMP.map(
    (l, n) => l + ORBIT[i][n] + (ORBIT[i + 1][n] - ORBIT[i][n]) * k,
  );
};
const pillarAt = (t) => {
  const u = ((t + PERIOD - PILLAR_LAG) % PERIOD) / (PERIOD / 2);
  const k = ease(u <= 1 ? u : 2 - u);
  return PILLAR_X + PILLAR_TRAVEL * k;
};
const SHADOW_STEPS = 72;
const timeAt = (step) => (step / SHADOW_STEPS) * PERIOD;

// Seen from above as [x, z]. The pillar spans floor to ceiling, so this view is the whole shadow.
// Positive when p lies left of the line from o through a
const side = (o, a, p) =>
  (a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]);
// Behind the pillar from lamp L, between the rays through the corners P and Q it sees outermost.
// Each test is positive on the shadow's side of one of its three edges
const wedgeAt = (t) => {
  const [lx, , lz] = lampAt(t);
  const L = [lx, lz];
  const px = pillarAt(t);
  if (
    Math.abs(lx - px) <= PILLAR_HALF &&
    Math.abs(lz - PILLAR_Z) <= PILLAR_HALF
  )
    throw new Error(`The lamp passes through the pillar at ${t}s`);
  const corners = [
    [px - PILLAR_HALF, PILLAR_Z - PILLAR_HALF],
    [px + PILLAR_HALF, PILLAR_Z - PILLAR_HALF],
    [px + PILLAR_HALF, PILLAR_Z + PILLAR_HALF],
    [px - PILLAR_HALF, PILLAR_Z + PILLAR_HALF],
  ];
  const P = corners.find((k) => corners.every((o) => side(L, k, o) >= -1e-9));
  const Q = corners.find((k) => corners.every((o) => side(L, k, o) <= 1e-9));
  return {
    L,
    P,
    Q,
    tests: [(p) => side(L, P, p), (p) => side(L, p, Q), (p) => side(Q, P, p)],
  };
};
const wedges = Array.from({ length: SHADOW_STEPS + 1 }, (_, i) =>
  wedgeAt(timeAt(i)),
);

// Every shape reaches past the walls, the surface's own clip cuts it to the exact polygon.
// Four corners correspond between keyframes, which clipping first would break
const FAR = 1600;
const beyond = (L, p) => {
  const d = Math.hypot(p[0] - L[0], p[1] - L[1]);
  return [p[0] + ((p[0] - L[0]) / d) * FAR, p[1] + ((p[1] - L[1]) / d) * FAR];
};
const quads = wedges.map((w) => [w.P, w.Q, beyond(w.L, w.Q), beyond(w.L, w.P)]);
const atHeight = (y) => quads.map((pts) => pts.map(([x, z]) => [x, y, z]));

// The part of the line a..b inside the wedge, as [from, to] in 0..1
const clipLine = (w, a, b) => {
  let [t0, t1] = [0, 1];
  for (const test of w.tests) {
    const [ta, tb] = [test(a), test(b)];
    if (ta < 0 && tb < 0) return null;
    if (ta < 0) t0 = Math.max(t0, ta / (ta - tb));
    if (tb < 0) t1 = Math.min(t1, ta / (ta - tb));
  }
  return t0 < t1 ? [t0, t1] : null;
};
// A wall from a to b seen from above gets a band per step, as tall as the room can need.
// A step without one takes the middle of the nearest band, so the band shrinks away where it was
const wallShadow = (a, b) => {
  const bands = wedges.map((w) => clipLine(w, a, b));
  const hit = bands.flatMap((band, i) => (band ? [i] : []));
  const gap = (i, j) =>
    Math.min(Math.abs(j - i), SHADOW_STEPS - Math.abs(j - i));
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return bands.map((band, i) => {
    if (!band) {
      const n = hit.reduce((best, j) => (gap(i, j) < gap(i, best) ? j : best));
      const mid = (bands[n][0] + bands[n][1]) / 2;
      band = [mid, mid];
    }
    const [[x0, z0], [x1, z1]] = band.map(at);
    return [
      [x0, -FAR, z0],
      [x1, -FAR, z1],
      [x1, FAR, z1],
      [x0, FAR, z0],
    ];
  });
};
const backShadow = wallShadow([-HALF_WIDTH, BACK], [HALF_WIDTH, BACK]);
const leftShadow = wallShadow([-HALF_WIDTH, BACK], [-HALF_WIDTH, FRONT]);
const rightShadow = wallShadow([HALF_WIDTH, BACK], [HALF_WIDTH, FRONT]);

// Sizes and matrices are final after a bake
await container.bake();
const BLUR = 8;
const shadowCss = [];
const matrixOf = (el) =>
  el.style
    .getPropertyValue("--c3r-matrix")
    .replace(/^matrix3d\(|\)$/g, "")
    .split(",")
    .map(Number);
// The polygon's x and y axes and origin in room space, through its matrix, which holds whatever
// flips the fit chose
const basisOf = (poly) => {
  const m = matrixOf(poly.domElement);
  const g = matrixOf(poly.domElement.parentElement);
  const r = g.length === 16 ? mat4.multiply([], g, m) : m;
  return { ex: r.slice(0, 3), ey: r.slice(4, 7), o: r.slice(12, 15) };
};
// A dark layer on the polygon, its clip-path stepping through one shape per step. The blur is on
// a parent, its own clip-path would cut it off
const paintShadow = (poly, id, opacity, shapes) => {
  const { style } = poly.domElement;
  const [w, h] = ["--c3r-width", "--c3r-height"].map((n) =>
    parseFloat(style.getPropertyValue(n)),
  );
  const { ex, ey, o } = basisOf(poly);
  const blur = BLUR / Math.hypot(...ex);
  const pad = Math.ceil(blur * 3);
  // A room point as a clip-path position in the padded box
  const toBox = (p) => {
    const d = sub(p, o);
    const u = dot(d, ex) / dot(ex, ex);
    const v = dot(d, ey) / dot(ey, ey);
    return `${(((u + pad) / (w + 2 * pad)) * 100).toFixed(2)}% ${(((v + pad) / (h + 2 * pad)) * 100).toFixed(2)}%`;
  };
  const stops = shapes
    .map(
      (pts, i) =>
        `${+((i / SHADOW_STEPS) * 100).toFixed(3)}%{clip-path:polygon(${pts.map(toBox).join()})}`,
    )
    .join("");
  shadowCss.push(
    `@keyframes ${id}{${stops}}`,
    `#${id}{animation:${id} ${PERIOD}s linear infinite;inset:${-pad}px}`,
  );
  const outer = document.createElement("div");
  outer.className = "shadow";
  outer.setAttribute(
    "style",
    `opacity:${opacity};filter:blur(${+blur.toFixed(1)}px)`,
  );
  const inner = document.createElement("div");
  inner.id = id;
  outer.append(inner);
  poly.contentElement.parentElement.append(outer);
};
paintShadow(floor, "s-floor", 0.8, atHeight(0));
paintShadow(ceiling, "s-ceiling", 0.7, atHeight(HEIGHT));
paintShadow(backWall, "s-back", 0.8, backShadow);
paintShadow(leftWall, "s-left", 0.8, leftShadow);
paintShadow(rightWall, "s-right", 0.8, rightShadow);
paintShadow(articlePanel, "s-frame", 0.8, backShadow);
paintShadow(tankPanel, "s-tank", 0.8, leftShadow);
paintShadow(filmPanel, "s-film", 0.8, rightShadow);

const css = [`:root{--dolly:${DOLLY * container.unitScale}px}`, ...shadowCss];
writePage(HERE, { css: css.join("\n"), scene: await container.toHTML() });
