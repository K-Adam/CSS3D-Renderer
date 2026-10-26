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

`CSS3DObject` and `CSS3DSprite` are re-exported from `three/addons`, so their elements receive pointer events as with three's renderer.

Perspective and orthographic cameras are supported, including `zoom`. Material `color`, `map` (image or canvas, with `repeat` and `offset`), `opacity` and map alpha (when `transparent`) and `side` (`BackSide` shows both sides) are applied, and a material's style is removed on its `dispose()`. `renderer.dispose()` removes every rendered scene.

Not supported yet: `ImageBitmap` maps such as GLTFLoader's, `flipY: false`, and map `rotation` and `center`.

## Node

Set up a DOM and inline `cssText()` as described in [c3r](../c3r/README.md#node), then render and serialize `renderer.domElement.outerHTML`. `TextureLoader` needs a browser, so set the image directly: `new Texture(Object.assign(document.createElement("img"), { src }))`. See [node-render.mjs](../../examples/node-render.mjs).

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
