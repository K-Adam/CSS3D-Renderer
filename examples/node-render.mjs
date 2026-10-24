// Prints a static HTML render, after `npm run build`: node examples/node-render.mjs > examples/static.html
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const THREE = await import("three");
const { C3RRenderer } = await import("c3r-three");
const { css } = await import("c3r");

const width = 800;
const height = 600;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, width / height, 1, 1000);
camera.position.z = 500;

// TextureLoader needs a browser
const texture = new THREE.Texture(
  Object.assign(document.createElement("img"), {
    src: "public/textures/crate.gif",
  }),
);
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(200, 200, 200),
  new THREE.MeshBasicMaterial({ map: texture }),
);
cube.rotation.set(0.4, 0.6, 0);
scene.add(cube);

const renderer = new C3RRenderer();
renderer.setSize(width, height);
renderer.render(scene, camera);

process.stdout.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>C3R static render</title>
    <style>${css}</style>
  </head>
  <body>${renderer.domElement.outerHTML}</body>
</html>
`);
