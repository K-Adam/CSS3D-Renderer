import { join } from "node:path";
import { happyC3R, load, writePage } from "../../../demos.mjs";

const HERE = import.meta.dirname;
const { Container, Group, Material, Transform, Tween, ElementObject } =
  await happyC3R();
const { rotateX, rotateY, rotateZ, translate } = Transform;
const { gores, tex, scale, full, crop } = load(join(HERE, "gores.json"));
const [TW, TH] = tex;

// The origin is the sheet's middle, where gores 5 and 6 meet on the equator
const CX = TW / 2;
const CY = gores[5].right[1];
const toScene = ([x, y]) => [x - CX, CY - y];
const toUv = ([x, y]) => [x / TW, 1 - y / TH];

const LAT_STEP = Math.PI / 2 / gores[0].north.length;
const RING_STEP = (2 * Math.PI) / gores.length;
const meanWidth =
  gores.reduce((sum, g) => sum + (g.right[0] - g.left[0]), 0) / gores.length;
// Folded, the gores make a prism this far from the axis
const APOTHEM = meanWidth / 2 / Math.tan(RING_STEP / 2);

// Printed names, transcribed, sitting on the very segment that carries them.
// at is in the coordinates of the 1800px wide overlay.png, seg counts from the equator.
const LABELS = [
  {
    text: "America",
    gore: 10,
    half: "south",
    seg: 0,
    at: [1537, 492],
    w: 92,
    angle: -0.3,
    href: "https://en.wikipedia.org/wiki/Naming_of_the_Americas",
  },
  {
    text: "Affrica",
    gore: 1,
    half: "south",
    seg: 1,
    at: [282, 542],
    w: 85,
    angle: 0,
    href: "https://en.wikipedia.org/wiki/Africa",
  },
  {
    text: "Asia",
    gore: 5,
    half: "north",
    seg: 3,
    at: [818, 262],
    w: 50,
    angle: 0,
    href: "https://en.wikipedia.org/wiki/Asia",
  },
  {
    text: "Europa",
    gore: 1,
    half: "north",
    seg: 3,
    at: [258, 250],
    w: 40,
    angle: 0,
    href: "https://en.wikipedia.org/wiki/Europe",
  },
  {
    text: "Oceanus Occidentalis",
    gore: 10,
    half: "south",
    seg: 1,
    at: [1510, 541],
    w: 100,
    angle: 0,
    href: "https://en.wikipedia.org/wiki/Pacific_Ocean",
  },
  {
    text: "Mare Indicum",
    gore: 4,
    half: "south",
    seg: 0,
    at: [655, 528],
    w: 90,
    angle: 0,
    href: "https://en.wikipedia.org/wiki/Indian_Ocean",
  },
];
const OVERLAY = TW / 1800;
const AMERICA = LABELS.find((l) => l.text === "America");

// One timeline for everything, in percent of the page
const HOLD = 7;
const FOLD = 43;
const TURN = 42;
const REST = 8;
const phase = (rest, moved, before, during, after) =>
  new Tween({
    from: rest,
    keyframes: [
      { steps: rest, duration: before },
      { steps: moved, duration: during },
      { steps: moved, duration: after },
    ],
    easing: "ease-in-out",
  });
const fold = (flat, folded) => phase(flat, folded, HOLD, FOLD, TURN + REST);

const northFirst = fold(rotateX(0), rotateX(-LAT_STEP / 2));
const northNext = fold(rotateX(0), rotateX(-LAT_STEP));
const southFirst = fold(rotateX(0), rotateX(LAT_STEP / 2));
const southNext = fold(rotateX(0), rotateX(LAT_STEP));
const ringRight = fold(rotateY(0), rotateY(RING_STEP));
const ringLeft = fold(rotateY(0), rotateY(-RING_STEP));
// The sheet's middle hinge is shared by the two chains, each takes half its angle
const middleRight = fold(rotateY(0), rotateY(RING_STEP / 2));
const middleLeft = fold(rotateY(0), rotateY(-RING_STEP / 2));
const push = fold(translate([0, 0, 0]), translate([0, 0, APOTHEM]));
// A full turn that stops with America's gore to the camera
const finalTurn = -(AMERICA.gore - 5.5) * RING_STEP - 2 * Math.PI;
const spin = phase(rotateY(0), rotateY(finalTurn), HOLD + FOLD, TURN, REST);
const tilt = fold(rotateZ(0), rotateZ(-0.16));

const FOV = 38;
const FAR = 3150;
const NEAR = 1500;
const container = new Container();
container.lights = {
  ambient: { intensity: 0.5 },
  directional: { direction: [0.45, -0.45, -0.8], intensity: 0.68 },
};
container.camera.fov = FOV;
container.camera.tween = fold(translate([0, 0, FAR]), translate([0, 0, NEAR]));

const material = new Material();
material.background = "gores.webp";
material.shading = "flat";

const addStrips = (parent, gore, origin, half) => {
  const [first, next] =
    half === "north" ? [northFirst, northNext] : [southFirst, southNext];
  const strips = [];
  let group = parent;
  let hingeY = origin[1];
  let lower = [gore.left, gore.right];
  for (const rung of gore[half]) {
    const y = toScene(lower[0])[1];
    const hinge = new Group();
    hinge.transform = translate([0, y - hingeY, 0]);
    hinge.tween = strips.length ? next : first;
    group.addChild(hinge);
    const base = [origin[0], y];
    // Counter-clockwise seen from the printed side
    const outline =
      half === "north"
        ? [...lower, ...rung.toReversed()]
        : [...rung, ...lower.toReversed()];
    hinge.addPolygon(
      outline.map((p) => {
        const [x, y] = toScene(p);
        return { position: [x - base[0], y - base[1], 0], uv: toUv(p) };
      }),
    ).textureSize = tex;
    strips.push({ group: hinge, base });
    group = hinge;
    hingeY = y;
    lower = rung;
  }
  return strips;
};

const addLabel = ({ group, base }, label) => {
  const a = document.createElement("a");
  a.href = label.href;
  a.target = "_blank";
  a.className = "label";
  a.textContent = label.text;
  a.style.width = `${label.w * OVERLAY}px`;
  const holder = new Group();
  const [x, y] = toScene(label.at.map((v) => v * OVERLAY));
  holder.transform = [
    translate([x - base[0], y - base[1], 8]),
    rotateZ(label.angle),
  ];
  group.addChild(holder);
  holder.addChild(new ElementObject(a));
};

const addGore = (parent, index, origin) => {
  const strips = {
    north: addStrips(parent, gores[index], origin, "north"),
    south: addStrips(parent, gores[index], origin, "south"),
  };
  for (const label of LABELS.filter((l) => l.gore === index))
    addLabel(strips[label.half][label.seg], label);
};

const stage = new Group();
container.root.addChild(stage);
stage.tween = tilt;
const spinner = new Group();
stage.addChild(spinner);
spinner.tween = spin;
const pusher = new Group();
spinner.addChild(pusher);
pusher.tween = push;
pusher.material = material;

// Hinges chain outward from the sheet's middle, so it stays centred while it closes
const chain = (from, step, ring, middle) => {
  let parent = pusher;
  let origin = [0, 0];
  for (let g = from; g >= 0 && g < gores.length; g += step) {
    const touch = toScene(step > 0 ? gores[g].left : gores[g].right);
    const hinge = new Group();
    hinge.transform = translate([
      touch[0] - origin[0],
      touch[1] - origin[1],
      0,
    ]);
    hinge.tween = parent === pusher ? middle : ring;
    parent.addChild(hinge);
    addGore(hinge, g, touch);
    parent = hinge;
    origin = touch;
  }
};
chain(6, 1, ringRight, middleRight);
chain(5, -1, ringLeft, middleLeft);

// Outside the 3D scene: Firefox sorted this large plane in front of gores far ahead of it.
// Lined up with the gores from the camera's own numbers, so it needs no script at any size.
const [FW, FH] = [full[0] * scale, full[1] * scale];
const sheetCenter = [
  -crop[0] * scale - CX + FW / 2,
  CY + crop[1] * scale - FH / 2,
];

const scene = await container.toHTML();
const css = `#sheet{--k:calc(50vh / tan(${FOV / 2}deg) / ${FAR});left:calc(50vw + var(--k) * ${sheetCenter[0].toFixed(1)});top:calc(50vh - var(--k) * ${sheetCenter[1].toFixed(1)});width:calc(var(--k) * ${FW.toFixed(1)});height:calc(var(--k) * ${FH.toFixed(1)})}
@keyframes sheet-away{${HOLD}%{opacity:1;scale:1}${HOLD + FOLD}%,100%{opacity:.16;scale:.96}}`;
writePage(HERE, { css, scene });
