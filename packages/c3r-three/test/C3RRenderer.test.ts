import { expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector3,
} from "three";
import { cssText } from "c3r";
import { C3RRenderer, CSS3DObject } from "../src/C3RRenderer.js";

const materialRule = (element: Element) => {
  const name = /c3r-material-\d+/.exec(element.className)![0];
  return cssText()
    .split("\n")
    .find((r) => r.startsWith(`.${name} `))!;
};

const setup = () => {
  const renderer = new C3RRenderer();
  renderer.setSize(800, 600);
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 800 / 600, 1, 1000);
  camera.position.set(5, 5, 20);
  camera.lookAt(0, 0, 0);
  const root = () =>
    renderer.domElement.querySelector(".c3r-view > .c3r-group")!;
  return { renderer, scene, camera, root };
};

const cssMatrix = (element: Element) => {
  const match = /matrix3d\(([^)]*)\)/.exec(
    (element as HTMLElement).style.getPropertyValue("--c3r-matrix"),
  );
  return mat4.clone(match![1].split(",").map(Number) as unknown as mat4);
};

it("places a nested sprite at its world position, facing the camera", () => {
  const { renderer, scene, camera, root } = setup();

  const group = new Group();
  group.position.set(10, 0, 0);
  group.rotation.y = Math.PI / 3;
  group.scale.setScalar(2);
  scene.add(group);

  const sprite = new Sprite(new SpriteMaterial());
  sprite.position.set(1, 2, 0);
  sprite.scale.set(1.5, 0.5, 1);
  group.add(sprite);

  renderer.render(scene, camera);

  const groupNode = root().firstElementChild!;
  const spriteNode = groupNode.firstElementChild!;
  const world = mat4.mul(
    mat4.create(),
    cssMatrix(groupNode),
    cssMatrix(spriteNode),
  );

  const position = sprite.getWorldPosition(new Vector3());
  expect(world[12]).toBeCloseTo(position.x, 6);
  expect(world[13]).toBeCloseTo(position.y, 6);
  expect(world[14]).toBeCloseTo(position.z, 6);

  const scale = sprite.getWorldScale(new Vector3());
  const cam = camera.matrixWorld.elements;
  [scale.x, scale.y].forEach((s, i) => {
    const column = [world[i * 4], world[i * 4 + 1], world[i * 4 + 2]];
    expect(Math.hypot(...column)).toBeCloseTo(s, 6);
    column.forEach((c, j) => expect(c / s).toBeCloseTo(cam[i * 4 + j], 6));
  });
  sprite.material.dispose();
});

it("follows visibility, geometry updates and removal", () => {
  const { renderer, scene, camera, root } = setup();

  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  scene.add(mesh);

  const polygons = () =>
    [...renderer.domElement.querySelectorAll("div")].filter((d) =>
      d.style.getPropertyValue("--c3r-width"),
    );

  renderer.render(scene, camera);
  const meshNode = root().firstElementChild as HTMLElement;
  const before = polygons();
  expect(before).toHaveLength(6);

  mesh.visible = false;
  renderer.render(scene, camera);
  expect(meshNode.style.display).toBe("none");

  mesh.visible = true;
  renderer.render(scene, camera);
  expect(meshNode.style.display).toBe("");

  const { position } = mesh.geometry.attributes;
  position.setX(0, 3);
  position.needsUpdate = true;
  renderer.render(scene, camera);
  expect(before.some((d) => d.isConnected)).toBe(false);
  expect(polygons().length).toBeGreaterThanOrEqual(6);

  scene.remove(mesh);
  renderer.render(scene, camera);
  expect(meshNode.isConnected).toBe(false);
  expect(polygons()).toHaveLength(0);
});

it("shares one stylesheet between renderers", () => {
  const a = setup();
  const b = setup();
  a.renderer.render(a.scene, a.camera);
  b.renderer.render(b.scene, b.camera);

  expect(document.adoptedStyleSheets).toHaveLength(1);
  expect([...a.root().classList]).toEqual(["c3r-group"]);
  expect(a.root().parentElement!.classList).toContain("c3r-view");
});

it("shares one material rule between meshes, removed on dispose", () => {
  const { renderer, scene, camera, root } = setup();

  const material = new MeshBasicMaterial({ color: 0xff0000 });
  scene.add(new Mesh(new BoxGeometry(), material));
  scene.add(new Mesh(new BoxGeometry(), material));
  renderer.render(scene, camera);

  // mesh node > polygon group
  const classes = [...root().children].map(
    (mesh) => mesh.firstElementChild!.className,
  );
  const className = /c3r-material-\d+/.exec(classes[0])![0];
  expect(classes[1]).toContain(className);

  const [sheet] = document.adoptedStyleSheets;
  const rules = () =>
    [...sheet.cssRules].filter((r) => r.cssText.startsWith(`.${className} `));
  expect(rules()).toHaveLength(1);
  expect(rules()[0].cssText).toContain("rgba(255");

  material.dispose();
  expect(rules()).toHaveLength(0);
});

it("applies the camera zoom", () => {
  const { renderer, scene } = setup();

  renderer.render(scene, new OrthographicCamera(-400, 400, 300, -300));
  const container = renderer.domElement.firstElementChild!;
  expect(container.classList).toContain("c3r-orthographic");

  const ortho = new OrthographicCamera(-400, 400, 300, -300);
  ortho.zoom = 2;
  renderer.render(scene, ortho);
  expect(cssText()).toMatch(/--c3r-camera-left: ?-200;/);

  const perspective = new PerspectiveCamera(90);
  perspective.zoom = 2;
  renderer.render(scene, perspective);
  expect(container.classList).toContain("c3r-perspective");
  // 2 * atan(tan(45deg) / 2)
  expect(cssText()).toMatch(/--c3r-camera-fov: ?53\.13/);
});

it("leaves white untinted, so a map needs no mask", () => {
  const { renderer, scene, camera, root } = setup();
  const rule = () =>
    materialRule(root().querySelector("[class*=c3r-material-]")!);

  const image = document.createElement("img");
  image.src = "crate.png";
  const material = new MeshBasicMaterial({ map: new Texture(image) });
  scene.add(new Mesh(new BoxGeometry(), material));
  renderer.render(scene, camera);
  expect(rule()).toMatch(/--c3r-background-color: ?transparent/);
  expect(rule()).toContain("--c3r-mask-image: none");

  material.color.set(0xff0000);
  renderer.render(scene, camera);
  expect(rule()).toMatch(/--c3r-background-color: ?rgba\(255, ?0, ?0/);
  expect(rule()).toMatch(/--c3r-mask-image: ?var\(--c3r-background-image/);
  material.dispose();
});

it("paints a white sprite without a map", () => {
  const { renderer, scene, camera, root } = setup();
  const material = new SpriteMaterial();
  scene.add(new Sprite(material));
  renderer.render(scene, camera);

  const rule = materialRule(root().querySelector("[class*=c3r-material-]")!);
  expect(rule).toMatch(/--c3r-background-color: ?rgba\(255, ?255, ?255/);
  material.dispose();
});

it("ignores opacity unless the material is transparent, as WebGL", () => {
  const { renderer, scene, camera } = setup();

  const material = new MeshBasicMaterial({ opacity: 0.5 });
  scene.add(new Mesh(new BoxGeometry(), material));
  renderer.render(scene, camera);
  expect(cssText()).not.toMatch(/--c3r-filter:/);

  material.transparent = true;
  renderer.render(scene, camera);
  expect(cssText()).toMatch(/--c3r-filter: ?opacity\(0\.5\)/);

  material.opacity = -0.1;
  renderer.render(scene, camera);
  expect(cssText()).toMatch(/--c3r-filter: ?opacity\(0\)/);
  material.dispose();
});

it("overlaps the folds of opaque meshes, convex ones thinly", () => {
  const { renderer, scene, camera } = setup();

  const width = () =>
    [...renderer.domElement.querySelectorAll<HTMLElement>(".c3r-polygon")].map(
      (d) => d.style.getPropertyValue("--c3r-width"),
    );

  const box = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  scene.add(box);
  renderer.render(scene, camera);
  for (const w of width()) expect(parseFloat(w)).toBeCloseTo(128.8);
  scene.remove(box);
  box.material.dispose();

  // Inside out, as a skybox
  const material = new MeshBasicMaterial();
  scene.add(new Mesh(new BoxGeometry().scale(-1, 1, 1), material));
  renderer.render(scene, camera);
  expect(new Set(width())).toEqual(new Set(["130px"]));

  material.transparent = true;
  renderer.render(scene, camera);
  expect(new Set(width())).toEqual(new Set(["128px"]));
  material.dispose();
});

it("keeps a sprite's material off its child elements", () => {
  const { renderer, scene, camera } = setup();

  const material = new SpriteMaterial({ color: 0xff0000 });
  const sprite = new Sprite(material);
  const child = new CSS3DObject(document.createElement("div"));
  sprite.add(child);
  scene.add(sprite);
  renderer.render(scene, camera);

  expect(child.element.closest("[class*=c3r-material-]")).toBeNull();
  material.dispose();
});

it("shows back faces unless the material is FrontSide", () => {
  const { renderer, scene, camera, root } = setup();

  const front = new MeshBasicMaterial();
  const double = new MeshBasicMaterial({ side: DoubleSide });
  scene.add(new Mesh(new BoxGeometry(), front));
  scene.add(new Mesh(new BoxGeometry(), double));
  renderer.render(scene, camera);

  const [frontRule, doubleRule] = [...root().children].map((mesh) =>
    materialRule(mesh.firstElementChild!),
  );
  expect(frontRule).not.toContain("backface-visibility");
  expect(doubleRule).toMatch(/backface-visibility: ?visible/);

  front.dispose();
  double.dispose();
});

it("removes the scenes and camera rules on dispose", () => {
  const { renderer, scene, camera } = setup();
  renderer.render(scene, camera);
  const className = [...renderer.domElement.firstElementChild!.classList].find(
    (c) => c.startsWith("c3r-camera-"),
  )!;

  renderer.dispose();
  expect(renderer.domElement.children).toHaveLength(0);
  expect(cssText()).not.toContain(`.${className} `);

  renderer.render(scene, camera);
  expect(renderer.domElement.children).toHaveLength(1);
});

it("scales the view by its densest polygon, flat faces stay small", () => {
  const { renderer, scene, camera } = setup();
  const mesh = new Mesh(
    new BoxGeometry(0.01, 0.01, 0.01),
    new MeshBasicMaterial(),
  );
  scene.add(mesh);
  renderer.render(scene, camera);

  const container = renderer.domElement.firstElementChild as HTMLElement;
  const unitScale = () =>
    container.style.getPropertyValue("--c3r-unit-scale") || "1";
  const face = renderer.domElement.querySelector(".c3r-polygon")!;
  const width = parseFloat(
    (face as HTMLElement).style.getPropertyValue("--c3r-width"),
  );
  expect(width).toBeLessThanOrEqual(129);
  const unit = Number(unitScale());
  expect(Math.log2(unit) % 1).toBe(0);
  expect((unit * 0.01) / width).toBeGreaterThanOrEqual(1);

  mesh.scale.setScalar(0);
  renderer.render(scene, camera);
  expect(unitScale()).toBe("1");
});
