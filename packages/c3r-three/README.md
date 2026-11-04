# c3r-three

A CSS renderer for three.js, built on [C3R](https://www.npmjs.com/package/c3r). Like three's own `CSS3DRenderer` it renders `CSS3DObject` and `CSS3DSprite`, but it also renders meshes and sprites with colors and textures.

Requires three.js r160 or newer. TypeScript declarations are included; install `@types/three` alongside.

## Usage

```sh
npm install c3r-three three
```

```js
import { C3RRenderer, CSS3DObject } from "c3r-three";

const renderer = new C3RRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

renderer.render(scene, camera);
```

Until `setSize()` the scenes fill the window and follow it, like a C3R `Container`.

`CSS3DObject` and `CSS3DSprite` are re-exported from `three/addons`, so their elements receive pointer events as with three's renderer.

Perspective and orthographic cameras are supported, including `zoom`. Material `color`, `map` (image or canvas, with `repeat` and `offset`, its alpha always; a `color` tints it with `Filter.tint`), `opacity` (when `transparent`) and `side` (`BackSide` shows both sides) are applied, and a material's style is removed on its `dispose()`. `renderer.dispose()` removes every rendered scene, and `renderer.toHTML()` (async) exports them.

`new C3RRenderer({ shading: true })` shades Lambert, Phong and Standard materials by the scene's visible `AmbientLight`s and first `DirectionalLight` or `PointLight`, in grayscale: smooth from the geometry's normals, or flat with `flatShading`. A point light falls off with the squared distance, as with the default `decay` and `distance`. `MeshBasicMaterial` stays unlit. `specular: true` adds Phong materials' highlights, without `specularMap`, and each camera turn then restyles every polygon with one.

`shadows: true` casts the light's shadows when it has `castShadow`, from meshes with `castShadow` onto meshes with `receiveShadow`. A caster is the bounding sphere of a `SphereGeometry`, a cylinder for an upright `CylinderGeometry`, and the bounding box of any other geometry. A shadow takes the light's share of the brightness at the receiving mesh's center, leaving the ambient. `shadows: { blur }` softens them by `blur` in scene units, at a cost in paint time. They are cast again in a frame where a mesh, a light or the scene's structure changed, not when only the camera moved.

`shading`, `specular` and `shadows` are also properties of the renderer, which apply at the next `render()`.

Not supported yet: `ImageBitmap` maps such as GLTFLoader's, `flipY: false`, and map `rotation` and `center`.

## Node

Set up a DOM with image loading as described in [c3r](../c3r/README.md#node), render, then export with `await renderer.toHTML()`. See [node-render.mjs](../../examples/node-render.mjs).

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
