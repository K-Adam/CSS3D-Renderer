import { expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { cssText } from "c3r";
import { C3RRenderer } from "../src/C3RRenderer.js";

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
    (element as HTMLElement).style.transform,
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

it("ignores opacity unless the material is transparent, as WebGL", () => {
  const { renderer, scene, camera } = setup();

  const material = new MeshBasicMaterial({ opacity: 0.5 });
  scene.add(new Mesh(new BoxGeometry(), material));
  renderer.render(scene, camera);
  expect(cssText()).not.toMatch(/--c3r-opacity:/);

  material.transparent = true;
  renderer.render(scene, camera);
  expect(cssText()).toMatch(/--c3r-opacity: ?0\.5/);
  material.dispose();
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
