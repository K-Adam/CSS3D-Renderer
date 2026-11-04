import { describe, expect, it, vi } from "vitest";
import { mat4 } from "gl-matrix";
import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector3,
} from "three";
import { Container, cssText, styleHTML } from "c3r";
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

it("tints a map by its color", () => {
  const { renderer, scene, camera, root } = setup();
  const rule = () =>
    materialRule(root().querySelector("[class*=c3r-material-]")!);

  const image = document.createElement("img");
  image.src = "crate.png";
  const material = new MeshBasicMaterial({ map: new Texture(image) });
  scene.add(new Mesh(new BoxGeometry(), material));
  renderer.render(scene, camera);
  expect(rule()).toMatch(/--c3r-background-color: ?transparent/);
  expect(rule()).not.toContain("--c3r-layers");

  material.color.set(0xff0000);
  renderer.render(scene, camera);
  expect(rule()).toMatch(/--c3r-layers: ?linear-gradient\(rgb\(100% 0% 0%\)/);

  // Beyond white in HDR, clamped like getHex rather than rejected
  material.color.setRGB(2, 0, 0);
  renderer.render(scene, camera);
  expect(rule()).toMatch(/--c3r-layers: ?linear-gradient\(rgb\(100% 0% 0%\)/);

  material.transparent = true;
  material.opacity = 0.4;
  renderer.render(scene, camera);
  expect(rule()).toMatch(/--c3r-filter: ?opacity\(0\.4\)/);
  expect(rule()).toMatch(/--c3r-layers: ?linear-gradient/);
  expect(rule()).toContain('url("crate.png")');
  material.dispose();
});

it("keeps a canvas map's url across a swap", () => {
  const { renderer, scene, camera, root } = setup();
  const rule = () =>
    materialRule(root().querySelector("[class*=c3r-material-]")!);
  const canvas = document.createElement("canvas");
  canvas.toDataURL = () => "data:image/png;base64,AA";
  const map = new Texture(canvas);
  const material = new MeshBasicMaterial({ map, color: 0xff0000 });
  scene.add(new Mesh(new BoxGeometry(), material));
  for (const next of [map, null, map]) {
    material.map = next;
    renderer.render(scene, camera);
  }
  expect(rule()).toContain("data:image/png;base64,AA");
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
  expect(frontRule).not.toContain("--c3r-backface");
  expect(doubleRule).toMatch(/--c3r-backface: ?visible/);

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

it("fills the window until setSize()", () => {
  const { scene, camera } = setup();
  const renderer = new C3RRenderer();
  renderer.render(scene, camera);
  const container = renderer.domElement.firstElementChild as HTMLElement;
  const viewport = () =>
    container.style.getPropertyValue("--c3r-viewport-height");
  expect(renderer.domElement.style.height).toBe("");
  expect(viewport()).toBe("");

  renderer.setSize(400, 300);
  expect(viewport()).toBe("300px");
});

it("exports the scenes as static html", async () => {
  const { renderer, scene, camera } = setup();
  renderer.render(scene, camera);
  const html = await renderer.toHTML();
  expect(html).toBe(styleHTML() + renderer.domElement.outerHTML);
  expect(html).toContain("c3r-container");
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

it("shades by the three.js material and lights only when asked", () => {
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.5));
  const light = new DirectionalLight(0xffffff, 2);
  light.position.set(0, 3, 0);
  scene.add(light);
  const box = new BoxGeometry();
  scene.add(
    ...[
      new MeshPhongMaterial({ flatShading: true }),
      new MeshPhongMaterial(),
      new MeshBasicMaterial(),
    ].map((material) => new Mesh(box, material)),
  );
  scene.updateMatrixWorld();
  const camera = new PerspectiveCamera();

  const classes = (renderer: C3RRenderer) =>
    [...renderer.domElement.querySelectorAll(".c3r-polygon")].map((p) =>
      /smooth/.test(p.className)
        ? "smooth"
        : /accumulator/.test(p.className)
          ? "flat"
          : "plain",
    );
  const faces = (kind: string) => Array<string>(6).fill(kind);

  const plain = new C3RRenderer();
  plain.render(scene, camera);
  expect(new Set(classes(plain))).toEqual(new Set(["plain"]));

  const shaded = new C3RRenderer({ shading: true });
  shaded.render(scene, camera);
  expect(classes(shaded)).toEqual([
    ...faces("flat"),
    ...faces("smooth"),
    ...faces("plain"),
  ]);

  const { style } = shaded.domElement.firstElementChild as HTMLElement;
  const value = (name: string) =>
    Number(style.getPropertyValue(`--c3r-light-${name}`));
  expect(value("ambient")).toBeCloseTo(0.5 / Math.PI, 5);
  expect(value("diffuse")).toBeCloseTo(2 / Math.PI, 5);
  expect(value("y")).toBeCloseTo(1, 5);
});

it("maps a Phong material's specular, only when asked", () => {
  const count = () => styleHTML().split("--c3r-shininess:").length - 1;
  const before = count();
  const scene = new Scene();
  const box = new BoxGeometry();
  for (const material of [
    new MeshPhongMaterial({ specular: 0xffffff, shininess: 30 }),
    new MeshPhongMaterial({ specular: 0x000000 }),
    new MeshStandardMaterial(),
  ])
    scene.add(new Mesh(box, material));
  scene.updateMatrixWorld();
  const camera = new PerspectiveCamera();
  new C3RRenderer({ specular: true }).render(scene, camera);
  new C3RRenderer({ shading: true }).render(scene, camera);
  expect(count()).toBe(before);
  new C3RRenderer({ shading: true, specular: true }).render(scene, camera);
  expect(count()).toBe(before + 1);
  const intensities = [
    ...styleHTML().matchAll(/--c3r-specular-intensity:\s*([\d.]+)/g),
  ];
  expect(Number(intensities.at(-1)![1])).toBeCloseTo((30 / 2 + 1) / 4, 5);
});

it("leaves out lights that give no light", () => {
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, -1));
  const off = new DirectionalLight(0xffffff, 0);
  off.position.set(1, 0, 0);
  const on = new DirectionalLight(0xffffff, 2);
  on.position.set(0, 3, 0);
  scene.add(off, on);
  scene.updateMatrixWorld();
  const renderer = new C3RRenderer({ shading: true });
  renderer.render(scene, new PerspectiveCamera());
  const { style } = renderer.domElement.firstElementChild as HTMLElement;
  expect(style.getPropertyValue("--c3r-light-ambient")).toBe("0");
  expect(Number(style.getPropertyValue("--c3r-light-y"))).toBeCloseTo(1, 5);
});

it("maps the first point light", () => {
  const scene = new Scene();
  const point = new PointLight(0xffffff, 20);
  point.position.set(1, 2, 3);
  const group = new Group();
  group.position.set(10, 0, 0);
  group.add(point);
  const directional = new DirectionalLight(0xffffff, 2);
  scene.add(group, directional);
  scene.updateMatrixWorld();
  const renderer = new C3RRenderer({ shading: true });
  renderer.render(scene, new PerspectiveCamera());
  const { style } = renderer.domElement.firstElementChild as HTMLElement;
  const value = (name: string) =>
    Number(style.getPropertyValue(`--c3r-light-${name}`));
  expect([value("point-x"), value("point-y"), value("point-z")]).toEqual([
    11, 2, 3,
  ]);
  expect(value("intensity")).toBeCloseTo(20 / Math.PI, 5);
});

describe("shadows", () => {
  // A ball over a lit floor, its top face at y = 0
  const setup = () => {
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(0, 10, 0);
    light.castShadow = true;
    const floor = new Mesh(
      new BoxGeometry(20, 1, 20).translate(0, -0.5, 0),
      new MeshPhongMaterial(),
    );
    floor.receiveShadow = true;
    const ball = new Mesh(new SphereGeometry(1), new MeshPhongMaterial());
    ball.position.set(0, 3, 0);
    ball.castShadow = true;
    scene.add(light, floor, ball);
    scene.updateMatrixWorld();
    const renderer = new C3RRenderer({ shading: true, shadows: true });
    const camera = new PerspectiveCamera();
    const render = () => {
      scene.updateMatrixWorld();
      renderer.render(scene, camera);
    };
    const layer = () =>
      renderer.domElement.querySelector<HTMLElement>(".c3r-shadow");
    return { light, ball, renderer, render, layer };
  };
  const points = (layer: HTMLElement) =>
    layer.querySelector<HTMLElement>("div")!.style.clipPath.split(",").length;

  it("casts from a light that casts, while shading and shadows are on", () => {
    const { light, renderer, render, layer } = setup();
    light.castShadow = false;
    render();
    expect(layer()).toBeNull();
    light.castShadow = true;
    render();
    // The directional light's share over the ambient
    expect(Number(layer()!.style.opacity)).toBeCloseTo(3 / 4, 5);
    expect(layer()!.style.filter).toBe("");
    renderer.shadows = { blur: 1 };
    render();
    expect(layer()!.style.filter).toMatch(/^blur\(/);
    renderer.shadows = false;
    render();
    expect(layer()).toBeNull();
    renderer.shadows = true;
    renderer.shading = false;
    render();
    expect(layer()).toBeNull();
  });

  it("fits a sphere to a sphere and a box to other geometry", () => {
    const { ball, render, layer } = setup();
    render();
    expect(points(layer()!)).toBeGreaterThan(8);
    ball.geometry = new BoxGeometry(2, 2, 2);
    render();
    expect(points(layer()!)).toBe(4);
    // Flat ones fall back to a box
    for (const flat of [
      [1, 1, 0],
      [0, 0, 1],
    ]) {
      ball.geometry = new CylinderGeometry(...flat);
      expect(render).not.toThrow();
    }
  });

  it("casts from the geometry's center", () => {
    const moved = setup();
    moved.ball.position.set(2, 3, 0);
    moved.render();
    const offset = setup();
    offset.ball.geometry = new SphereGeometry(1).translate(2, 0, 0);
    offset.render();
    expect(offset.layer()!.innerHTML).toBe(moved.layer()!.innerHTML);
  });

  it("skips a caster around the point light", () => {
    const { light, ball, render } = setup();
    light.visible = false;
    const point = new PointLight(0xffffff, 50);
    point.castShadow = true;
    ball.add(point);
    expect(render).not.toThrow();
    // On the surface, where rounding decides
    for (let i = 1; i <= 20; i++) {
      ball.rotation.set(i, 2 * i, 3 * i);
      ball.scale.set(1 + i / 7, 1 + i / 11, 1 + i / 13);
      const height = 0.5 + i / 17;
      ball.geometry =
        i % 2
          ? new BoxGeometry(1.3, height, 0.7)
          : new CylinderGeometry(0.6, 0.6, height);
      point.position.set(0, height / 2, 0);
      expect(render).not.toThrow();
    }
  });

  it("drops the caster of a mesh rebuilt without one", () => {
    const { ball, render, layer } = setup();
    render();
    ball.castShadow = false;
    ball.geometry.attributes.position.needsUpdate = true;
    render();
    expect(layer()).toBeNull();
  });

  it("casts again only once something moved", () => {
    const bake = vi.spyOn(Container.prototype, "bake");
    const { ball, render } = setup();
    const cast = () => bake.mock.lastCall![0]?.shadows;
    render();
    expect(cast()).toBe(true);
    render();
    expect(cast()).toBe(false);
    ball.position.x = 1;
    render();
    expect(cast()).toBe(true);
    bake.mockRestore();
  });
});
