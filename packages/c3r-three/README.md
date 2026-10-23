# c3r-three

A CSS renderer for three.js, built on [C3R](https://www.npmjs.com/package/c3r). Like three's own `CSS3DRenderer` it renders `CSS3DObject` and `CSS3DSprite`, but it also renders meshes and sprites with colors and textures.

Requires three.js r160 or newer.

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

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
