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

A `Material` is a class rule in a shared stylesheet, so the objects using it share one style. The rule stays until `material[Symbol.dispose]()` is called, or the material leaves a `using` block; otherwise it may be removed once the material and its elements are garbage-collected. c3r-three does this on the three.js material's `dispose()`.

Cameras work the same way: a camera's class sets the variables that `styles.css` projects with, and is disposed the same way.

A group applies `matrix` on assignment, a material or camera on `update()`. A polygon is laid out from its vertices on construction; put it in a group to move it.

## Node

C3R builds plain DOM elements, so it runs on a server-side DOM like [happy-dom](https://github.com/capricorn86/happy-dom). Stylesheets are not serialized, so inline `cssText()`, the base styles plus the material and camera rules, after building the scene. There is no layout either, so set the size explicitly.

```sh
npm install c3r @happy-dom/global-registrator
```

```js
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

const { Container, cssText } = await import("c3r");

const container = new Container();
container.setSize(800, 600);
// ... build the scene

const html = `<!doctype html><style>${cssText()}</style>${container.domElement.outerHTML}`;
```

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
