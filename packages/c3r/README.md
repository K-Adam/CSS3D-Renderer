# c3r

**C3R.js** is a lightweight library for displaying 3D scenes with CSS. It is designed to be used as a CSS3D backend for existing libraries. It provides classes to construct textured polygons, nest 3D transformed elements and handle camera.

## Usage

With a bundler:

```sh
npm install c3r
```

```js
import { Container, Polygon } from "c3r";
```

Or with a script tag, using [GitHub Releases](https://github.com/K-Adam/CSS3D-Renderer/releases) or a CDN:

```html
<script src="https://unpkg.com/c3r@0.2/dist/c3r.min.js"></script>
```

It bundles gl-matrix and exposes a `C3R` global.

TypeScript declarations are included.

> **0.2.0:** the package is ESM-only (`require()` needs Node 22.12+), builds are untranspiled ES2023, and gl-matrix is now v3. The script tag build is `dist/c3r.min.js` (was `build/C3R.min.js`); it no longer exposes `mat4`/`vec3`/… globals, load gl-matrix yourself and use `glMatrix.mat4` etc. The three.js renderer moved to the [`c3r-three`](https://www.npmjs.com/package/c3r-three) package. Renamed to camelCase: `CSSClass.className`, `Polygon.uvScale`/`uvOffset`, `PerspectiveCamera.perspectiveCoefficient`; the polygon layout fields are now private. `CustomElement` extends `Group`, so it can have children. `RootObject` holds the camera (`Container.camera` forwards to it), so `RootObject.updateMatrix()` takes no argument.

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
