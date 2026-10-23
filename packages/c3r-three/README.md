# c3r-three

A drop-in replacement for the three.js `CSS3DRenderer`, built on [C3R](https://www.npmjs.com/package/c3r). Besides `CSS3DObject` and `CSS3DSprite`, it renders meshes (`BufferGeometry` and `Geometry`) with textures.

Supports three.js r90 up to r124.

## Usage

```sh
npm install c3r-three three@0.90
```

```js
import { CSS3DRenderer, CSS3DObject } from "c3r-three";

const renderer = new CSS3DRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
```

Or with script tags, after three.js, gl-matrix and `C3R.min.js`: include `dist/c3r-three.js`, which adds `THREE.CSS3DRenderer`, `THREE.CSS3DObject` and `THREE.CSS3DSprite`.

See the [examples](https://k-adam.github.io/CSS3D-Renderer/examples/).
