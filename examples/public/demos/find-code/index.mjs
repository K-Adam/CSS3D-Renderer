import path from "node:path";
import { vec3 } from "gl-matrix";
import {
  happyC3R,
  load,
  normalOf,
  facesAny,
  addFlat,
  lit,
  toVertices,
  rgb,
  hex,
  boxFaces,
  rect,
  cameraView,
  writePage,
} from "../../../demos.mjs";

const HERE = import.meta.dirname;
const { Container, ElementObject, Group, Transform } = await happyC3R();
const LIGHT = { ambient: 0.66, intensity: 0.5, direction: [0.45, -0.9, -0.55] };
const EYE = [20, 400, 800];
const TARGET = [0, 130, -40];
const CODE = "1847";
// How far scrolling moves the camera towards its target
const DOLLY = 350;
const ZOOMED_EYE = vec3.scaleAndAdd(
  [],
  EYE,
  vec3.normalize([], vec3.sub([], TARGET, EYE)),
  DOLLY,
);

const container = new Container();
container.camera.transform = Transform.targetTo(EYE, TARGET);
const root = new Group();
root.domElement.classList.add("room");
container.root.addChild(root);

const el = (bg, cls) => {
  const e = document.createElement("div");
  e.style.backgroundColor = bg;
  if (cls) e.className = cls;
  return e;
};

const addFace = (g, pts, color, cls) =>
  g.addPolygon(toVertices(pts), {
    contentElement: el(lit(color, normalOf(pts), LIGHT), cls),
  });
const quad = (g, side, lo, hi, color, cls) =>
  addFace(g, rect(side, lo, hi), color, cls);
const box = (g, lo, hi, color, skip = []) => {
  for (const [side, pts] of Object.entries(boxFaces(lo, hi)))
    if (!skip.includes(side)) addFace(g, pts, color);
};

const items = load(path.join(HERE, "roomtris.json"));
const item = (tag) => items.find((i) => i.tag === tag);
const bboxOf = (tag) => {
  const pts = item(tag).tris.flatMap((t) => t.p);
  const f = (fn) => [0, 1, 2].map((a) => fn(...pts.map((p) => p[a])));
  return [f(Math.min), f(Math.max)];
};

const DESK_TOP = 176;
// The live screen is 250 by 150 at half scale, the bezel is cut to fit it
const SCREEN_W = 125;
const SCREEN_H = 75;
const BEZEL = 8;
const MON_X = -160;
const MON_BACK = -262;
const MON_FRONT = MON_BACK + 8;
const BEZEL_Y = DESK_TOP + 30;
const SCREEN_Y = BEZEL_Y + BEZEL + SCREEN_H / 2;

// The views this page can reach, so a face turned away from all of them skips the DOM
const POSES = {
  home: [EYE, TARGET],
  zoomed: [ZOOMED_EYE, TARGET],
  drawer: [
    [110, 470, 330],
    [130, 30, -230],
  ],
  screen: [
    [MON_X, SCREEN_Y + 15, MON_FRONT + 287],
    [MON_X, SCREEN_Y, MON_FRONT - 33],
  ],
  door: [
    [-80, 300, 620],
    [190, 110, 0],
  ],
};
const POSE_EYES = Object.values(POSES).map(([eye]) => eye);
// A box that never moves can drop the faces no pose sees
const solid = (lo, hi, color) => {
  for (const pts of Object.values(boxFaces(lo, hi)))
    if (facesAny(pts, POSE_EYES)) addFace(root, pts, color);
};

// A cutaway room: walls have a thickness, so it reads as a model on a table.
// Half width, height, half depth and wall thickness.
const W = 400;
const H = 500;
const D = 320;
const T = 18;
const WALL = "#d8cbb2";
const WOOD = "#b98a5c";
const RIM = "#efe6d4";
const DOOR_Z0 = -80;
const DOOR_Z1 = 120;
const DOOR_H = 400;
box(root, [-W - T, -24, -D - T], [W + T, 0, D], "#7a5a3c", ["-y", "-z"]);
quad(root, "+y", [-W, 0.5, -D], [W, 0.5, D], WOOD, "floor");
quad(root, "+z", [-W, 0, -D], [W, H, -D], WALL, "wall");
quad(root, "+x", [-W, 0, -D], [-W, H, D], WALL, "wall");
quad(root, "-x", [W, 0, -D], [W, H, DOOR_Z0], WALL, "wall");
quad(root, "-x", [W, 0, DOOR_Z1], [W, H, D], WALL, "wall");
quad(root, "-x", [W, DOOR_H, DOOR_Z0], [W, H, DOOR_Z1], WALL, "wall");
quad(root, "+y", [-W - T, H, -D - T], [-W, H, D], RIM);
quad(root, "+y", [W, H, -D - T], [W + T, H, D], RIM);
quad(root, "+y", [-W, H, -D - T], [W, H, -D], RIM);
quad(root, "+z", [-W - T, 0, D], [-W, H, D], RIM);
quad(root, "+z", [W, 0, D], [W + T, H, D], RIM);

// Door casing, its face flush with the closed door
const CASE = 14;
const CASE_X = W - 6;
solid([CASE_X, 0, DOOR_Z0 - CASE], [W, DOOR_H, DOOR_Z0], RIM);
solid([CASE_X, 0, DOOR_Z1], [W, DOOR_H, DOOR_Z1 + CASE], RIM);
solid(
  [CASE_X, DOOR_H, DOOR_Z0 - CASE],
  [W, DOOR_H + CASE, DOOR_Z1 + CASE],
  RIM,
);
// The reveal runs through the wall's thickness, faces only: a box would show through in Firefox
const REVEAL = "#d9cfba";
quad(root, "+z", [W, 0, DOOR_Z0], [W + T, DOOR_H, DOOR_Z0], REVEAL);
quad(root, "-z", [W, 0, DOOR_Z1], [W + T, DOOR_H, DOOR_Z1], REVEAL);
quad(root, "-y", [W, DOOR_H, DOOR_Z0], [W + T, DOOR_H, DOOR_Z1], REVEAL);

const DESK_WOOD = "#8c5f3a";
const DESK_FRONT = "#a06e43";
const PULL = "#e0c068";
const DESK_UNDER = DESK_TOP - 12;
const DESK_X0 = -345;
const DESK_X1 = -35;
const DESK_Z0 = -314;
const DESK_Z1 = -150;
const PEDESTAL_X0 = DESK_X1 - 104;
// The knee hole stays empty, so the chair's seat can slide in under the top
const DESK_LEGS = [
  [
    [DESK_X0 + 6, 0, DESK_Z0 + 4],
    [DESK_X0 + 18, DESK_UNDER, DESK_Z1 - 8],
  ],
  [
    [PEDESTAL_X0, 0, DESK_Z0 + 4],
    [DESK_X1 - 6, DESK_UNDER, DESK_Z1 - 8],
  ],
  [
    [DESK_X0 + 18, 50, DESK_Z0 + 8],
    [PEDESTAL_X0, DESK_UNDER, DESK_Z0 + 18],
  ],
];
const addDesk = () => {
  for (const [lo, hi] of DESK_LEGS) solid(lo, hi, DESK_WOOD);
  solid(
    [DESK_X0, DESK_UNDER, DESK_Z0],
    [DESK_X1, DESK_TOP, DESK_Z1],
    "#a97a4e",
  );
  const frontZ = DESK_Z1 - 8 + 0.5;
  const pullX = (PEDESTAL_X0 + DESK_X1 - 6) / 2;
  for (const [y0, y1] of [
    [10, 56],
    [62, 108],
    [114, DESK_UNDER - 6],
  ]) {
    quad(
      root,
      "+z",
      [PEDESTAL_X0 + 8, y0, frontZ],
      [DESK_X1 - 14, y1, frontZ],
      DESK_FRONT,
    );
    const ym = (y0 + y1) / 2;
    solid(
      [pullX - 15, ym - 2.5, frontZ],
      [pullX + 15, ym + 2.5, frontZ + 4.5],
      PULL,
    );
  }
  const STAND = "#4a5058";
  solid(
    [MON_X - 38, DESK_TOP + 1, MON_BACK - 22],
    [MON_X + 38, DESK_TOP + 5, MON_BACK + 26],
    STAND,
  );
  solid(
    [MON_X - 8, DESK_TOP + 5, MON_BACK - 12],
    [MON_X + 8, BEZEL_Y + 20, MON_BACK - 5],
    STAND,
  );
  solid(
    [MON_X - 45, BEZEL_Y + 12, MON_BACK - 5],
    [MON_X + 45, BEZEL_Y + 2 * BEZEL + SCREEN_H - 12, MON_BACK],
    STAND,
  );
  solid(
    [MON_X - SCREEN_W / 2 - BEZEL, BEZEL_Y, MON_BACK],
    [MON_X + SCREEN_W / 2 + BEZEL, BEZEL_Y + SCREEN_H + 2 * BEZEL, MON_FRONT],
    "#343a42",
  );
};

const CAB_X0 = 95;
const CAB_X1 = 305;
const CAB_Z0 = -318;
const CAB_FRONT = -204;
const CAB_TOP = 154;
const DRAWER_X0 = CAB_X0 + 12;
const DRAWER_X1 = CAB_X1 - 12;
const DRAWER_H = 56;
const DRAWER_DEPTH = 110;
const SLIDE = 100;
// How far back in the drawer the note stands
const NOTE_Z = 50;
// Both open to the same footprint, one above the other
const DRAWER_Y = { top: 82, drawer: 20 };
const addCabinet = () => {
  solid([CAB_X0 + 4, 0, CAB_Z0], [CAB_X1 - 4, 14, CAB_FRONT - 6], "#6f4a2c");
  solid([CAB_X0, 14, CAB_Z0], [DRAWER_X0, CAB_TOP - 12, CAB_FRONT], DESK_WOOD);
  solid([DRAWER_X1, 14, CAB_Z0], [CAB_X1, CAB_TOP - 12, CAB_FRONT], DESK_WOOD);
  for (const [y0, y1] of [
    [14, 20],
    [76, 82],
    [138, CAB_TOP - 12],
  ])
    solid(
      [DRAWER_X0, y0, CAB_FRONT - 6],
      [DRAWER_X1, y1, CAB_FRONT],
      DESK_WOOD,
    );
  solid(
    [CAB_X0 - 4, CAB_TOP - 12, CAB_Z0],
    [CAB_X1 + 4, CAB_TOP, CAB_FRONT + 4],
    "#a97a4e",
  );
  for (const y0 of Object.values(DRAWER_Y))
    quad(
      root,
      "+z",
      [DRAWER_X0, y0, CAB_FRONT + 0.5],
      [DRAWER_X1, y0 + DRAWER_H, CAB_FRONT + 0.5],
      "#2a1a10",
    );
};

// The kit's rug is the loudest thing in the room, and it isn't the point
const RUG_TONE = [0.66, 0.68, 0.8];
// After the shell: Firefox zoomed in paints the room over earlier furniture
for (const { tag, tris } of items) {
  if (tag === "Potted_Plant") addDesk();
  if (tag === "Books") addCabinet();
  const tone = (col) =>
    tag === "Rug_Rectangle"
      ? hex(rgb(col).map((v, i) => v * RUG_TONE[i]))
      : col;
  const g = new Group();
  root.addChild(g);
  const keep = tris
    .filter((t) => facesAny(t.p, POSE_EYES))
    .map((t) => ({ p: t.p, c: lit(tone(t.c), normalOf(t.p), LIGHT) }));
  addFlat(g, keep, el, EYE);
}

// Daylight behind the door
quad(
  root,
  "-x",
  [W + T, 0, DOOR_Z0],
  [W + T, DOOR_H, DOOR_Z1],
  "#ffffff",
  "day",
);

const hinge = new Group();
hinge.transform = Transform.translate([CASE_X, 0, DOOR_Z1]);
root.addChild(hinge);
const door = new Group();
door.domElement.classList.add("door");
hinge.addChild(door);
const DOOR_W = DOOR_Z1 - DOOR_Z0;
box(door, [0, 0, -DOOR_W], [6, DOOR_H, 0], "#7a4e2e", ["-y", "+y", "+x"]);
for (const [y0, y1] of [
  [40, 180],
  [220, 360],
])
  quad(door, "-x", [-0.5, y0, 26 - DOOR_W], [-0.5, y1, -26], "#6a4226");
// Backplate and lever, near the free edge on the room side
box(door, [-3, 165, 8 - DOOR_W], [0, 235, 32 - DOOR_W], PULL, ["+x"]);
box(door, [-16, 195, 14 - DOOR_W], [-3, 207, 26 - DOOR_W], PULL, ["+x"]);
box(door, [-22, 194, 12 - DOOR_W], [-16, 208, 66 - DOOR_W], PULL, ["+x"]);

// The floor plan has to stay clear of itself and the door's swing. The drawers
// only count past the cabinet's overhang, and both share one footprint.
const checkLayout = () => {
  const floorParts = [
    ...[
      "Potted_Plant",
      "Lamp_Round_Floor",
      "Bookcase_Open_Low",
      "Desk_Chair",
    ].map((tag) => [tag, ...bboxOf(tag)]),
    ...DESK_LEGS.map(([lo, hi]) => ["desk", lo, hi]),
    ["cabinet", [CAB_X0 - 4, 0, CAB_Z0], [CAB_X1 + 4, 0, CAB_FRONT + 4]],
  ];
  const drawerOut = [
    "open drawer",
    [DRAWER_X0, 0, CAB_FRONT + 4],
    [DRAWER_X1, 0, CAB_FRONT + SLIDE],
  ];
  const overlap = ([, a0, a1], [, b0, b1]) =>
    [0, 2].every((k) => a0[k] < b1[k] && b0[k] < a1[k]);
  for (const part of [...floorParts, drawerOut]) {
    const [name, lo, hi] = part;
    const fromHinge = Math.hypot(
      Math.max(lo[0] - CASE_X, 0, CASE_X - hi[0]),
      Math.max(lo[2] - DOOR_Z1, 0, DOOR_Z1 - hi[2]),
    );
    if (fromHinge < DOOR_W) throw new Error(`${name} is in the door's swing`);
    for (const other of floorParts)
      if (other[0] !== name && overlap(part, other))
        throw new Error(`${name} overlaps ${other[0]}`);
  }
  const [bookLo, bookHi] = bboxOf("Books");
  if (
    bookLo[1] < CAB_TOP ||
    bookLo[0] < CAB_X0 ||
    bookHi[0] > CAB_X1 ||
    bookLo[2] < CAB_Z0 ||
    bookHi[2] > CAB_FRONT
  )
    throw new Error("the books aren't on the cabinet");
  // The chair tucks under the top, so only its back can run into it
  if (
    item("Desk_Chair").tris.some((t) =>
      t.p.some(([, y, z]) => y > DESK_UNDER && z < DESK_Z1),
    )
  )
    throw new Error("the chair's back is in the desktop");
};
checkLayout();

const place = (parent, node, transform, scale = 1) => {
  const o = new ElementObject(node);
  o.scale = [scale, scale];
  const g = new Group();
  g.transform = transform;
  g.addChild(o);
  parent.addChild(g);
};

// Each front is a summary, its content what's in the drawer: Find can only reveal what a
// details holds. One name, so opening one shuts the other.
const addDrawer = (id, label, content, furnish) => {
  const y0 = DRAWER_Y[id];
  const y1 = y0 + DRAWER_H;
  const wallTop = y1 - 6;
  const back = CAB_FRONT - DRAWER_DEPTH;
  const at = new Group();
  root.addChild(at);
  const drawer = new Group();
  drawer.domElement.classList.add("slide", `s-${id}`);
  at.addChild(drawer);
  // In two, split where the note stands: Firefox paints a floor crossing its plane over it
  for (const [z0, z1] of [
    [CAB_FRONT - NOTE_Z, CAB_FRONT],
    [back, CAB_FRONT - NOTE_Z],
  ])
    quad(drawer, "+y", [DRAWER_X0, y0, z0], [DRAWER_X1, y0, z1], "#5d3f28");
  const SIDE = "#7c5635";
  quad(
    drawer,
    "-x",
    [DRAWER_X0, y0, back],
    [DRAWER_X0, wallTop, CAB_FRONT],
    SIDE,
  );
  quad(
    drawer,
    "+x",
    [DRAWER_X1, y0, back],
    [DRAWER_X1, wallTop, CAB_FRONT],
    SIDE,
  );
  quad(
    drawer,
    "+z",
    [DRAWER_X0, y0, back],
    [DRAWER_X1, wallTop, back],
    "#6a4a2e",
  );
  furnish?.(drawer, y0);
  const details = document.createElement("details");
  details.id = id;
  details.setAttribute("name", "drawers");
  details.style.setProperty("--w", `${DRAWER_X1 - DRAWER_X0}px`);
  details.style.setProperty("--h", `${DRAWER_H}px`);
  details.innerHTML = `<summary aria-label="${label}"></summary>${content}`;
  place(
    drawer,
    details,
    Transform.translate([
      (DRAWER_X0 + DRAWER_X1) / 2,
      (y0 + y1) / 2,
      CAB_FRONT + 1,
    ]),
  );
};
addDrawer("top", "Top drawer", "", (g, y) => {
  // A pencil, so opening the wrong drawer still finds something
  const z0 = CAB_FRONT - 62;
  const z1 = CAB_FRONT - 55;
  box(g, [DRAWER_X0 + 40, y, z0], [DRAWER_X0 + 130, y + 6, z1], "#e0b23c", [
    "-y",
  ]);
  box(g, [DRAWER_X0 + 130, y, z0], [DRAWER_X0 + 138, y + 6, z1], "#d98f8a", [
    "-y",
  ]);
});
addDrawer(
  "drawer",
  "Bottom drawer",
  `<div class="note">door code <b>${CODE}</b></div>`,
);

const screen = document.createElement("div");
screen.className = "screen";
screen.innerHTML = `<input id="code" required pattern="${CODE}" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="Door code" placeholder="code"><small></small>`;
place(root, screen, Transform.translate([MON_X, SCREEN_Y, MON_FRONT + 1]), 0.5);

const sticky = document.createElement("div");
sticky.className = "sticky";
// An image: Firefox's Find matches generated content, so CSS content would be hit before the drawer
const stickySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="90"><g font-family="Segoe Print,Comic Sans MS,cursive" font-size="15" fill="#3a3010"><text x="12" y="30">Where did I put</text><text x="12" y="54">the door code?</text></g></svg>`;
sticky.style.setProperty(
  "background-image",
  `url("data:image/svg+xml;base64,${Buffer.from(stickySvg).toString("base64")}")`,
);
sticky.setAttribute("role", "img");
sticky.setAttribute("aria-label", "A sticky note asks where the code went");
place(root, sticky, Transform.translate([-10, 310, -D + 1]), 0.9);

const camera = (sel, [eye, target]) =>
  `${sel} .c3r-container>.c3r-view{${cameraView(eye, target)};animation:none}`;
const scene = await container.toHTML();
// Values from the scene, the rest is in style.css
const css = `:root{--dolly:${DOLLY * container.unitScale}px;--note-z:${NOTE_Z}px}
${camera("html:has(details[open])", POSES.drawer)}
${camera("html:has(#code:focus)", POSES.screen)}
${camera("html:has(#code:valid)", POSES.door)}
${Object.keys(DRAWER_Y)
  .map(
    (id) =>
      `html:has(#${id}[open]) .c3r-group.s-${id}{transform:translateZ(${SLIDE}px)}`,
  )
  .join("\n")}`;
writePage(HERE, { css, scene });
