# CSS 3D Renderer

**C3R.js** is a lightweight library for displaying 3D scenes with CSS. It is designed to be used as a CSS3D backend for existing libraries. It provides classes to construct textured polygons, nest 3D transformed elements and handle camera.

## Usage

With a bundler:

```sh
npm install c3r
```

```js
import { Container, Polygon } from "c3r";
```

Or with script tags: include `build/C3R.standalone.js` (gl-matrix bundled), or include [gl-matrix 3](https://github.com/toji/gl-matrix) followed by `build/C3R.min.js`.

> **0.2.0:** builds are untranspiled ES2015+, and gl-matrix is now v3. `C3R.standalone.js` no longer exposes `mat4`/`vec3`/… globals; load gl-matrix yourself and use `glMatrix.mat4` etc.

## Development

Requires Node 20.19+.

```sh
npm install
npm run build   # build/ (ESM, UMD, minified UMD, standalone)
npm run lint
npm run format
```

## Examples

The example projects be found in the _examples_ directory. You can try them out live [here](https://k-adam.github.io/CSS3D-Renderer/examples/)

I replaced the original CSS3D renderer of Three.js with a **C3R.js** based implementation, which supports buffergeometry and textures as well. It can be found at _examples/js/renderers/CSS3DRenderer.js_
