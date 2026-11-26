import { happyC3R, rect, writePage } from "../../../demos.mjs";

const HERE = import.meta.dirname;
const { Container, Group, Material, Timeline, Transform, Tween } =
  await happyC3R(HERE);

const radians = (degrees) => (degrees * Math.PI) / 180;

// The sky is a photograph on the inside of a cylinder around the lake. assets/sky.jpg covers
// SKY_SPAN degrees of it, from the horizon up to SKY_TOP degrees
const SKY_RADIUS = 5000;
const SKY_SPAN = 170;
const SKY_TOP = 46;
const SKY_PANELS = 16;
const SKY_ZENITH = "#c4cfe9";

// The jetty runs away from the shore along -z, its deck DECK_TOP above the water
const JETTY = { halfWidth: 80, near: 420, far: -900 };
const DECK_TOP = 46;
// The deck is laid in lengths, each an element of its own to keep its boards sharp
const DECK_LENGTHS = 3;
// One repeat of the planks is nine boards wide
const PLANKS_TILE = 160;
const PILE_SIDES = 8;
const PILE = { radius: 8, height: 72, spacing: 190 };
// How far from its centre the end grain reaches in assets/pile-end.jpg
const PILE_END_RADIUS = 0.36;
const PILE_END_INSET = 0.5;

const EYE = [24, DECK_TOP + 150, 330];
// How far scrolling walks the camera along the jetty
const WALK = 700;
// The camera drifts to each side and turns a little, once over in `period` seconds
const SWAY = { drift: 14, turn: 0.01, period: 8 };

// The water near the jetty, in two strips, far to near, each an element WATER_PIXELS wide.
// The waves thin out over the far one, further out they would squeeze into stripes
const WATER_STRIPS = [
  { near: -300, far: -1000, halfWidth: 2500, fades: true },
  { near: 250, far: -300, halfWidth: 1500 },
];
const WATER_PIXELS = 1500;
// World size of one repeat of the waves, and the seconds its two layers take to drift across
const WAVE_TILE = [1100, 520];
const WAVE_PERIODS = [44, 29];
// The second layer starts this many percent down the texture, so the two never line up
const WAVE_LAYER_OFFSET = 37;

const container = new Container();
document.body.append(container.domElement);
container.camera.fov = 60;
container.camera.transform = [
  Transform.translate(EYE),
  Transform.rotateX(-0.1),
];
container.camera.tween = [
  new Tween({
    keyframes: [Transform.translate([0, 0, -WALK])],
    timeline: new Timeline({ scroll: true }),
  }),
  // A slow sway, so the reflections shift even when the page is not scrolled
  new Tween({
    from: [
      Transform.translate([-SWAY.drift, 0, 0]),
      Transform.rotateY(-SWAY.turn),
    ],
    keyframes: [
      [Transform.translate([SWAY.drift, 0, 0]), Transform.rotateY(SWAY.turn)],
    ],
    duration: SWAY.period,
    easing: "ease-in-out",
    loop: true,
    alternate: true,
  }),
];
// The sun is about to rise behind the hills ahead on the right, low enough for long shadows
container.lights = {
  ambient: { intensity: 0.5 },
  directional: { direction: [-0.7, -0.4, 0.6], intensity: 0.75 },
};

const textured = (image, shading) => {
  const material = new Material();
  material.background = image;
  if (shading) material.shading = shading;
  return material;
};
const skyMaterial = textured("assets/sky.jpg");
// The same sky as the lake gives it back, smeared downwards and darker towards the nearer water
const waterSkyMaterial = textured("assets/sky-water.jpg");
const deckMaterial = textured("assets/planks.jpg", "flat");
deckMaterial.shadows = { opacity: 0.6, blur: 4 };
const pileMaterial = textured("assets/pile.jpg", "smooth");
const pileEndMaterial = textured("assets/pile-end.jpg", "flat");

// The sky's panels meet edge to edge and a hairline of the page shows between them, so a
// second ring a little further out, turned by half a panel, backs each joint
const SKY_RINGS = [
  { radius: SKY_RADIUS + 60, shift: 0.5, panels: SKY_PANELS - 1 },
  { radius: SKY_RADIUS, shift: 0, panels: SKY_PANELS },
];
const addSky = (group, material) => {
  for (const { radius, shift, panels } of SKY_RINGS)
    for (let panel = 0; panel < panels; panel++) {
      const [left, right] = [panel, panel + 1].map((edge) => {
        const u = (edge + shift) / SKY_PANELS;
        const angle = radians((u - 0.5) * SKY_SPAN);
        return { u, x: radius * Math.sin(angle), z: -radius * Math.cos(angle) };
      });
      const height = radius * Math.tan(radians(SKY_TOP));
      group.addPolygon([
        { position: [left.x, 0, left.z], uv: [left.u, 0] },
        { position: [right.x, 0, right.z], uv: [right.u, 0] },
        { position: [right.x, height, right.z], uv: [right.u, 1] },
        { position: [left.x, height, left.z], uv: [left.u, 1] },
      ]).material = material;
    }
};

// The deck's boards lie across the jetty. Only its top ever faces the eye, and from above it
// its reflection hides under it
const addDeck = (group) => {
  const length = (JETTY.near - JETTY.far) / DECK_LENGTHS;
  for (let piece = 0; piece < DECK_LENGTHS; piece++) {
    const far = JETTY.far + piece * length;
    const points = rect(
      "+y",
      [-JETTY.halfWidth, DECK_TOP, far],
      [JETTY.halfWidth, DECK_TOP, far + length],
    );
    const vertices = points.map(([x, y, z]) => ({
      position: [x, y, z],
      uv: [z / PLANKS_TILE, x / PLANKS_TILE],
    }));
    group.addPolygon(vertices).material = deckMaterial;
  }
};

// A round pile standing on its group's origin. The bark wraps once around it, so its grain
// meets itself at every edge, and the faces go in as one mesh, so the library closes the
// joints between them and shades across them by the normals
const addPile = (group) => {
  const { radius, height } = PILE;
  const around = 2 * Math.PI * radius;
  const corners = Array.from({ length: PILE_SIDES + 1 }, (_, corner) => {
    const angle = (corner / PILE_SIDES) * 2 * Math.PI;
    const normal = [Math.cos(angle), 0, Math.sin(angle)];
    const at = (y) => ({
      position: [radius * normal[0], y, radius * normal[2]],
      uv: [corner / PILE_SIDES, y / around],
      normal,
    });
    return { angle, bottom: at(0), top: at(height) };
  });
  const triangles = corners.slice(1).flatMap((left, side) => {
    const right = corners[side];
    return [
      [left.bottom, right.bottom, right.top],
      [left.bottom, right.top, left.top],
    ];
  });
  for (const face of group.addTriangles(triangles))
    face.material = pileMaterial;
  // The sawn end, its rings centred in the image. It sits a little under the rim, level with
  // it a hairline of the lake showed between the two
  const cap = corners
    .slice(1)
    .map(({ angle, top: { position } }) => ({
      position: [position[0], height - PILE_END_INSET, position[2]],
      uv: [
        0.5 + PILE_END_RADIUS * Math.cos(angle),
        0.5 + PILE_END_RADIUS * Math.sin(angle),
      ],
    }))
    .reverse();
  group.addPolygon(cap).material = pileEndMaterial;
};

// The piles beside the deck throw their shadows across it
const addPiles = (parent) => {
  const side = JETTY.halfWidth + PILE.radius;
  for (let z = JETTY.far + PILE.radius; z < JETTY.near; z += PILE.spacing)
    for (const x of [-side, side]) {
      const pile = new Group();
      pile.transform = Transform.translate([x, 0, z]);
      parent.addChild(pile);
      addPile(pile);
      pile.shadowCaster = {
        shape: "cylinder",
        radius: PILE.radius,
        height: PILE.height,
        center: [0, PILE.height / 2, 0],
      };
    }
};

const sky = new Group();
container.root.addChild(sky);
addSky(sky, skyMaterial);

// The lake's reflection is the sky and its hills built again and turned upside down. The
// jetty stays out of it, its deck all but hides where it would show
const reflection = new Group();
reflection.transform = Transform.scale([1, -1, 1]);
container.root.addChild(reflection);
addSky(reflection, waterSkyMaterial);

// The water's surface adds what a breeze does to it, pale crests drifting two ways
const [waveWidth, waveDepth] = WAVE_TILE;
for (const { near, far, halfWidth, fades } of WATER_STRIPS) {
  const content = document.createElement("div");
  content.className = "water";
  // Each layer is twice the strip's width and drifts by one repeat of the waves
  const repeat = `${((waveWidth / (4 * halfWidth)) * 100).toFixed(2)}%`;
  content.style.setProperty(
    "--tile",
    `${repeat} ${((waveDepth / (near - far)) * 100).toFixed(2)}%`,
  );
  content.style.setProperty("--drift", repeat);
  if (fades) content.classList.add("fades");
  content.innerHTML = WAVE_PERIODS.map(
    (period, layer) =>
      `<div class="waves" style="--period:${period}s;--offset:${layer * WAVE_LAYER_OFFSET}%"></div>`,
  ).join("");
  const points = rect("+y", [-halfWidth, 0, far], [halfWidth, 0, near]);
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  container.root.addPolygon(
    points.map((position, i) => ({ position, uv: uvs[i] })),
    { contentElement: content, getDomSize: () => WATER_PIXELS },
  );
}

const jetty = new Group();
container.root.addChild(jetty);
addDeck(jetty);
addPiles(jetty);

const scene = await container.toHTML({ shadows: true });
writePage(HERE, { css: `:root{background:${SKY_ZENITH}}`, scene });
