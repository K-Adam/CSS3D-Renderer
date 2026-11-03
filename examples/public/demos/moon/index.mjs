import path from "node:path";
import { happyC3R, load, writePage } from "../../../demos.mjs";

const HERE = import.meta.dirname;
const {
  Container,
  Group,
  Material,
  ElementObject,
  Transform,
  PerspectiveCamera,
} = await happyC3R(HERE);

const RADIUS = 400;
const LABEL_RADIUS = RADIUS * 1.03;
const FOV = 22;
const CAMERA_DISTANCE = 2900;
const DEG = Math.PI / 180;
// Scroll height of one full turn, in vh
const SPAN = 500;
const FADE_STEPS = 72;

// Coordinates and facts checked against the sources in CREDITS.md
const SITES = [
  {
    name: "Apollo 11",
    lat: 0.674,
    lon: 23.473,
    wiki: "Apollo_11",
    note: "July 1969, Sea of Tranquility. The first crewed landing brought back 21.55 kg of samples.",
  },
  {
    name: "Apollo 12",
    lat: -3.013,
    lon: -23.422,
    wiki: "Apollo_12",
    note: "November 1969, Ocean of Storms, close to the Surveyor 3 probe.",
    // Pointing east, the label would cover Apollo 14
    west: true,
  },
  {
    name: "Apollo 14",
    lat: -3.646,
    lon: -17.472,
    wiki: "Apollo_14",
    note: "February 1971, Fra Mauro.",
  },
  {
    name: "Apollo 15",
    lat: 26.132,
    lon: 3.633,
    wiki: "Apollo_15",
    note: "July 1971, Hadley Rille.",
  },
  {
    name: "Apollo 16",
    lat: -8.973,
    lon: 15.501,
    wiki: "Apollo_16",
    note: "April 1972, Descartes.",
  },
  {
    name: "Apollo 17",
    lat: 20.191,
    lon: 30.772,
    wiki: "Apollo_17",
    note: "December 1972, Taurus-Littrow. The last Apollo landing.",
  },
  {
    name: "Tycho",
    lat: -43.3,
    lon: -11.22,
    wiki: "Tycho_(lunar_crater)",
    note: "85 km wide and young for its size, about 110 million years old.",
  },
  {
    name: "Copernicus",
    lat: 9.62,
    lon: -20.08,
    wiki: "Copernicus_(lunar_crater)",
    note: "A rayed crater about 96 km wide.",
  },
  {
    name: "Mare Orientale",
    lat: -19.4,
    lon: -92.8,
    wiki: "Mare_Orientale",
    note: "An impact basin about 930 km wide, on the western limb.",
  },
  {
    name: "Chang'e 4",
    lat: -45.5,
    lon: 177.6,
    wiki: "Chang%27e_4",
    note: "January 2019, Von Kármán crater. The first soft landing on the far side.",
  },
];

const mesh = load(path.join(HERE, "moon_mesh.json"));
const container = new Container(new PerspectiveCamera(FOV));
container.camera.transform = Transform.translate([0, 0, CAMERA_DISTANCE]);

// The page CSS animates these two, tilt has to pivot on the Moon's centre
const addTurning = (parent) => {
  const tilt = new Group();
  tilt.domElement.classList.add("tilt");
  parent.addChild(tilt);
  const spin = new Group();
  spin.domElement.classList.add("spin");
  tilt.addChild(spin);
  return spin;
};

const moon = new Group();
addTurning(container.root).addChild(moon);
moon.material = new Material();
moon.material.background = "moon_atlas.jpg";
moon.addTriangles(
  mesh.tris.map(({ p, uv }) =>
    p.map((v, i) => ({ position: v.map((c) => c * RADIUS), uv: uv[i] })),
  ),
);

// Gone before the limb, sampled from the same linear turn that scrolling drives. The peak of
// facing is cos(lat), and Chang'e 4 at -45.5 still has to reach full opacity
const fadeKeyframes = (lat, lon, i) => {
  const steps = Array.from({ length: FADE_STEPS + 1 }, (_, k) => {
    const facing =
      Math.cos(lat * DEG) * Math.cos((lon - (k * 360) / FADE_STEPS) * DEG);
    const o = Math.min(1, Math.max(0, (facing - 0.35) / 0.2));
    return `${(k * 100) / FADE_STEPS}%{opacity:${o.toFixed(2)};visibility:${o ? "visible" : "hidden"}}`;
  });
  return `@keyframes lab${i}{${steps.join("")}}.l${i}{animation-name:lab${i}}`;
};

// A camera-facing plane cuts into the sphere towards the disc centre. Its own 3D context paints the
// labels over the Moon with no depth test, and the fade hides those on the far side. Outside
// the round clip, a note may pass the disc edge
const overlay = new Container(container.camera);
const labels = addTurning(overlay.root);
const labelKeyframes = SITES.map(({ name, lat, lon, wiki, note, west }, i) => {
  const a = document.createElement("a");
  a.className = west ? `site west l${i}` : `site l${i}`;
  a.href = `https://en.wikipedia.org/wiki/${wiki}`;
  a.target = "_blank";
  a.innerHTML = `<i></i><b>${name}</b><span>${note}</span>`;
  const label = new ElementObject(a);
  // Twice the font at half the scale, a 3D plane rasterizes at its own size and frays in Firefox
  label.scale = [0.5, 0.5];
  label.center = west ? [1, 0.5] : [0, 0.5];
  label.domElement.classList.add("face");
  const at = new Group();
  const cosLat = Math.cos(lat * DEG);
  at.transform = Transform.translate([
    LABEL_RADIUS * cosLat * Math.sin(lon * DEG),
    LABEL_RADIUS * Math.sin(lat * DEG),
    LABEL_RADIUS * cosLat * Math.cos(lon * DEG),
  ]);
  at.addChild(label);
  labels.addChild(at);
  return fadeKeyframes(lat, lon, i);
});

const scene = await container.toHTML();
await overlay.bake();

// Projected radius of the mesh's inscribed sphere, as a fraction of the view, for the round clip
const focal = 1 / (2 * Math.tan((FOV / 2) * DEG));
const inRadius = RADIUS * mesh.inradius;
const clipFraction =
  (focal * inRadius) /
  Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - inRadius * inRadius);

writePage(HERE, {
  css: `:root { --r: calc(${clipFraction.toFixed(5)} * var(--s)); }
body { height: ${SPAN + 100}vh; }
${labelKeyframes.join("\n")}`,
  scene,
  labels: overlay.domElement.outerHTML,
  // Each section sits where the turn shows what it describes. Sun at longitude 62, view at 360p
  at: (turn) => (turn * SPAN).toFixed(2),
});
