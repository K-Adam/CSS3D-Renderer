import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { happyC3R, load, cameraView, writePage } from "../../../demos.mjs";

const HERE = import.meta.dirname;
const corpus = load(path.join(HERE, "corpus.json"));
const AUTHORS = {
  2701: "Herman Melville",
  1342: "Jane Austen",
  84: "Mary Shelley",
  345: "Bram Stoker",
  1661: "Arthur Conan Doyle",
  11: "Lewis Carroll",
  120: "Robert Louis Stevenson",
  35: "H. G. Wells",
  36: "H. G. Wells",
  174: "Oscar Wilde",
};
for (const b of corpus.books) b.author = AUTHORS[b.pg];
// The page takes its text from this corpus, and its spines from this atlas
const atlasSha = createHash("sha256")
  .update(fs.readFileSync(path.join(HERE, "assets/atlas.jpg")))
  .digest("hex");
if (atlasSha !== corpus.atlasSha)
  throw new Error(
    "assets/atlas.jpg and corpus.json come from different prep runs",
  );

const { Container, Group, Material, Transform, ElementObject } =
  await happyC3R(HERE);
// The raster size follows the pixel ratio it is built at, 2 sits between desktop and phone
globalThis.devicePixelRatio = 2;

const BOOKS_PER_SHELF = 20;
const SHELVES = 5;
const SHELF_GAP = 250;
const BOARD = 14;
const INNER_W = 1000;
const LEFT = -INNER_W / 2;
const RIGHT = INNER_W / 2;
const TOP = SHELVES * SHELF_GAP;
const SIDE = 22;
const BOOK_DEPTH = 140;
const FLOOR_Y = -40;
const WALL_Z = -170;
const BACK_Z = -160;
const ROOM_HALF_W = 1700;
const WOOD_TILE = 500;
const TEXT_SCALE = 3;
const TEXT_W = 420;
const PULL = 210;
const [ATLAS_W, ATLAS_H] = corpus.atlas;

const material = (background, shading = "flat") => {
  const m = new Material();
  m.background = background;
  m.shading = shading;
  return m;
};
const quad = (a, b, c, d, [u0, v0, u1, v1] = [0, 0, 1, 1]) => [
  { position: a, uv: [u0, v0] },
  { position: b, uv: [u1, v0] },
  { position: c, uv: [u1, v1] },
  { position: d, uv: [u0, v1] },
];
// Half a texel in, so a spine doesn't bleed its neighbour
const atlasCell = ([x, y, w, h]) => [
  (x + 0.5) / ATLAS_W,
  1 - (y + h - 0.5) / ATLAS_H,
  (x + w - 0.5) / ATLAS_W,
  1 - (y + 0.5) / ATLAS_H,
];

const container = new Container();
container.lights = {
  ambient: { intensity: 0.34 },
  point: { position: [0, 900, 1000], intensity: 1500000 },
};

const world = new Group();
container.root.addChild(world);
const atlas = material("assets/atlas.jpg");
const pages = material("assets/pages.jpg");
const covers = [0, 1, 2, 3, 4, 5].map((t) => material(`assets/cover-${t}.jpg`));

const surface = (texture, corners, uv) => {
  const g = new Group();
  world.addChild(g);
  g.material = material(texture, "smooth");
  g.addPolygon(quad(...corners, uv));
};
// First in the document: Firefox zoomed in falls back on document order
surface(
  "assets/wall.jpg",
  [
    [-ROOM_HALF_W, FLOOR_Y, WALL_Z],
    [ROOM_HALF_W, FLOOR_Y, WALL_Z],
    [ROOM_HALF_W, 1500, WALL_Z],
    [-ROOM_HALF_W, 1500, WALL_Z],
  ],
  [0, 0, 2, 0.9],
);
surface(
  "assets/floor.jpg",
  [
    [-ROOM_HALF_W, FLOOR_Y, 1500],
    [ROOM_HALF_W, FLOOR_Y, 1500],
    [ROOM_HALF_W, FLOOR_Y, WALL_Z],
    [-ROOM_HALF_W, FLOOR_Y, WALL_Z],
  ],
  [0, 0, 4, 2],
);

const bookcase = new Group();
world.addChild(bookcase);
bookcase.material = material("assets/wood.jpg", "smooth");

let planks = 0;
// Grain along the longer side, one texture scale everywhere, each board its own patch
const plank = (a, b, c, d) => {
  const len = Math.hypot(...a.map((v, k) => v - b[k]));
  const wid = Math.hypot(...b.map((v, k) => v - c[k]));
  const u = (planks * 0.618) % 1;
  const v = (planks++ * 0.382) % 1;
  return bookcase.addPolygon(
    len >= wid
      ? quad(a, b, c, d, [u, v, u + len / WOOD_TILE, v + wid / WOOD_TILE])
      : quad(b, c, d, a, [u, v, u + wid / WOOD_TILE, v + len / WOOD_TILE]),
  );
};
const box = (x0, x1, y0, y1, z0, z1, faces) => {
  const corners = {
    // Past the edges: at a corner the wall would show through the seam
    front: [
      [x0 - 0.5, y0 - 0.5, z1],
      [x1 + 0.5, y0 - 0.5, z1],
      [x1 + 0.5, y1 + 0.5, z1],
      [x0 - 0.5, y1 + 0.5, z1],
    ],
    top: [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    bottom: [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ],
    left: [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    right: [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
    ],
  };
  for (const f of faces) plank(...corners[f]);
};

// In this order: Firefox paints the inner sides over the books if they come later
box(LEFT - SIDE, LEFT, FLOOR_Y, TOP, WALL_Z, 18, ["right"]);
box(RIGHT, RIGHT + SIDE, FLOOR_Y, TOP, WALL_Z, 18, ["left"]);
plank(
  [LEFT, -BOARD, BACK_Z],
  [RIGHT, -BOARD, BACK_Z],
  [RIGHT, TOP, BACK_Z],
  [LEFT, TOP, BACK_Z],
).material = material("assets/wood-back.jpg", "smooth");
for (const [x0, x1] of [
  [-ROOM_HALF_W, LEFT - SIDE],
  [RIGHT + SIDE, ROOM_HALF_W],
])
  box(x0, x1, FLOOR_Y, 56, WALL_Z, -162, ["front", "top"]);
for (let r = 0; r <= SHELVES; r++) {
  const faces = ["front"];
  if (r < SHELVES) faces.push("top");
  if (r > 0) faces.push("bottom");
  const y = r * SHELF_GAP;
  box(LEFT, RIGHT, y - BOARD, y, BACK_Z, 16, faces);
}
box(LEFT - SIDE, LEFT, FLOOR_Y, TOP, WALL_Z, 18, ["front", "left"]);
box(RIGHT, RIGHT + SIDE, FLOOR_Y, TOP, WALL_Z, 18, ["front", "right"]);
box(LEFT - SIDE - 6, RIGHT + SIDE + 6, FLOOR_Y, -BOARD, -162, 24, [
  "front",
  "top",
  "left",
  "right",
]);
box(LEFT - SIDE - 8, RIGHT + SIDE + 8, TOP, TOP + 20, WALL_Z, 26, [
  "front",
  "bottom",
  "left",
  "right",
]);

const shelve = (books) => {
  const widths = books.map((_, i) => 34 + ((i * 37) % 15));
  const heights = books.map((_, i) => 176 + ((i * 53) % 38));
  const slots = [];
  for (let r = 0; r < SHELVES; r++) {
    const row = books
      .slice(r * BOOKS_PER_SHELF, (r + 1) * BOOKS_PER_SHELF)
      .map((_, k) => r * BOOKS_PER_SHELF + k);
    const total = row.reduce((s, i) => s + widths[i], 0);
    const pad = (INNER_W - total) / BOOKS_PER_SHELF;
    const y = (SHELVES - 1 - r) * SHELF_GAP;
    let x = LEFT + pad / 2;
    row.forEach((i, k) => {
      const w = widths[i];
      const h = heights[i];
      const shorter = (j) => j >= 0 && j < row.length && heights[row[j]] < h;
      // The gaps between books show every side turned to the shelf view, x = 0
      const leftSeen = x > 0 || shorter(k - 1);
      const rightSeen = x + w < 0 || shorter(k + 1);
      slots.push({ i, x, y, w, h, leftSeen, rightSeen });
      x += w + pad;
    });
  }
  return slots;
};

const textObject = (element, h, transform) => {
  const o = new ElementObject(element);
  o.setSize(TEXT_W, h * TEXT_SCALE);
  o.scale = [1 / TEXT_SCALE, 1 / TEXT_SCALE];
  o.transform = transform;
  return o;
};

// Gutenberg's plain text marks italics with underscores
const italics = (p) => p.replace(/_(.+?)_/g, "<i>$1</i>");
const addBook = (book, { i, x, y, w, h, leftSeen, rightSeen }) => {
  const d = BOOK_DEPTH;
  const g = new Group();
  world.addChild(g);
  g.material = atlas;
  g.domElement.id = `g${i}`;
  g.domElement.classList.add("book");
  g.transform = Transform.translate([x, y, 0]);
  const cover = covers[book.tint];
  g.addPolygon(
    quad([0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], atlasCell(book.uv)),
  );
  g.addPolygon(quad([0, h, 0], [w, h, 0], [w, h, -d], [0, h, -d])).material =
    pages;
  const backCover = g.addPolygon(
    quad([0, 0, -d], [0, 0, 0], [0, h, 0], [0, h, -d]),
  );
  backCover.material = cover;
  if (!leftSeen) backCover.domElement.classList.add("closed-off");
  // Bottom and fore-edge only show once the book leaves the shelf
  for (const p of [
    quad([0, 0, -d], [w, 0, -d], [w, 0, 0], [0, 0, 0]),
    quad([w, 0, -d], [0, 0, -d], [0, h, -d], [w, h, -d]),
  ]) {
    const edge = g.addPolygon(p);
    edge.material = pages;
    edge.domElement.classList.add("closed-off");
  }
  // The page before the hinge: Firefox paints these close planes in document order, cover last
  const details = document.createElement("details");
  details.id = `b${i}`;
  details.setAttribute("name", "library");
  details.innerHTML = `<summary aria-label="${book.title} volume ${book.vol}"></summary><div class="text" id="t${i}"><h2>${book.title}, ${book.vol}</h2>${book.paras.map((p) => `<p>${italics(p)}</p>`).join("")}</div>`;
  // z is not scaled by the element's scale, so this stays in world units
  details.style.setProperty("--w", `${w}px`);
  const page = textObject(details, h, [
    // Inside the cover, so the page can't show through a shut book
    Transform.translate([w - 1, h / 2, -d / 2]),
    Transform.rotateY(Math.PI / 2),
  ]);
  page.domElement.classList.add("page");
  g.addChild(page);

  // Swings on the spine edge, the transition needs a rotation not a matrix
  const hingeAt = new Group();
  g.addChild(hingeAt);
  hingeAt.transform = Transform.translate([w, 0, 0]);
  const hinge = new Group();
  hingeAt.addChild(hinge);
  hinge.domElement.classList.add("hinge");
  const frontCover = hinge.addPolygon(
    quad([0, 0, 0], [0, 0, -d], [0, h, -d], [0, h, 0]),
  );
  frontCover.material = cover;
  if (!rightSeen) frontCover.domElement.classList.add("closed-off");

  // An element, not a polygon: the page's light must not follow the closed pose.
  // Its text comes from attributes, so Find doesn't match a book that is shut.
  const plate = document.createElement("div");
  plate.dataset.t = book.title;
  plate.dataset.a = book.author;
  plate.dataset.v = `Volume ${book.vol}`;
  plate.className = "plate";
  plate.innerHTML = "<i></i>";
  hinge.addChild(
    textObject(plate, h, [
      Transform.translate([-0.6, h / 2, -d / 2]),
      Transform.rotateY(-Math.PI / 2),
    ]),
  );
};

const slots = shelve(corpus.books);
for (const slot of slots) addBook(corpus.books[slot.i], slot);
container.camera.transform = Transform.translate([0, 625, 1720]);
container.camera.fov = 45;
const scene = await container.toHTML();

const portrait = (rule) => `@media (orientation:portrait){${rule}}`;

const rules = [
  // Fits the case's width in portrait, narrower than the 16:9 pose. Not run on a device
  portrait(
    `.c3r-container.c3r-container>.c3r-view{${cameraView([0, 600, 2300], [0, 600, 0])}}`,
  ),
];
for (const { i, x, y, w, h } of slots) {
  // Pulled out of the shelf with its cover to the camera, spine on the left
  const spineX = x + w / 2 - BOOK_DEPTH / 2;
  rules.push(
    `#g${i}:has(>*>#b${i}[open]){translate:0 0 ${PULL}px;transform:translate3d(${spineX.toFixed(1)}px,${y}px,0) rotateY(-90deg) translate3d(${-w}px,0,0);z-index:1}`,
  );
  // The left page spreads to spineX - BOOK_DEPTH, the right one as far the other way
  const midY = y + h / 2;
  const open = `.c3r-container:has(#b${i}[open])>.c3r-view`;
  rules.push(
    `${open}{${cameraView([spineX, midY, PULL + 300], [spineX, midY, PULL])}}`,
    portrait(
      `${open}{${cameraView([spineX + BOOK_DEPTH / 2, midY, PULL + 370], [spineX + BOOK_DEPTH / 2, midY, PULL])}}`,
    ),
  );
}

const items = corpus.books
  .map((b, i) => ({ t: `${b.title}, ${b.vol}`, i }))
  .sort((a, b) => a.t.localeCompare(b.t));
writePage(HERE, { css: rules.join("\n"), scene, items });
