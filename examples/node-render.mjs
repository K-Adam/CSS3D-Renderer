// Prints a static HTML render, after `npm run build`: node examples/node-render.mjs > examples/static.html
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({
  url: "http://localhost/",
  settings: {
    enableImageFileLoading: true,
    fetch: {
      virtualServers: [{ url: "/", directory: import.meta.dirname }],
    },
  },
});

const THREE = await import("three");
const { C3RRenderer } = await import("c3r-three");

const scene = new THREE.Scene();
// Aspect unused, the view follows the window
const camera = new THREE.PerspectiveCamera(70, 1, 1, 1000);
camera.position.z = 500;

const texture = await new THREE.TextureLoader().loadAsync(
  "public/textures/crate.gif",
);
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(200, 200, 200),
  new THREE.MeshBasicMaterial({ map: texture }),
);
cube.rotation.set(0.4, 0.6, 0);
scene.add(cube);

const renderer = new C3RRenderer();
renderer.render(scene, camera);

// Without head and body tags the style lands in the head
process.stdout.write(`<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>C3R static render</title>
<style>body { margin: 0 }</style>
${await renderer.toHTML()}
`);
