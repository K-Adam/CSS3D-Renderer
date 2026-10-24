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

## Node

C3R builds plain DOM elements, so it runs on a server-side DOM like [happy-dom](https://github.com/capricorn86/happy-dom). Stylesheets are not serialized, so inline the exported `css`. There is no layout either, so set the size explicitly.

```sh
npm install c3r @happy-dom/global-registrator
```

```js
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

const { Container, css } = await import("c3r");

const container = new Container();
container.setSize(800, 600);
// ... build the scene

const html = `<!doctype html><style>${css}</style>${container.domElement.outerHTML}`;
```

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
