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

## API

```js
import { Container, Group, Material } from "c3r";
import { mat4 } from "gl-matrix";

const container = new Container(); // fills the window until setSize()
document.body.append(container.domElement);

const cube = new Group();
container.root.addChild(cube);
cube.addPolygon([
  { position: [-100, 100, 100], uv: [0, 1] },
  { position: [-100, -100, 100], uv: [0, 0] },
  { position: [100, -100, 100], uv: [1, 0] },
  { position: [100, 100, 100], uv: [1, 1] },
]);

cube.material = new Material();
cube.material.backgroundImageSrc = "crate.jpg";

container.camera.matrix = mat4.fromTranslation(mat4.create(), [0, 0, -400]);
```

| Class                                     | What it is                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Container`                               | The viewport: `domElement`, `root` group, `camera`, `setSize()`                                   |
| `Group`                                   | A transformed node: `matrix`, `addChild()`, `addPolygon()`, `addTriangles()` merges into polygons |
| `Polygon`                                 | A flat, convex or concave textured polygon from CCW vertices, with `uvScale`, `uvOffset`          |
| `ElementObject`                           | Any HTML element in the scene, centered on the origin, with `scale`, `center`, `rotation`         |
| `Material`                                | `backgroundColor`, `backgroundImageSrc`, `opacity`, inherited by the object's descendants         |
| `PerspectiveCamera`, `OrthographicCamera` | `matrix` (inverse world) and `fov`, or `left`, `right`, `top`, `bottom`                           |

Every property applies on assignment; there is no `update()` to call. A polygon is laid out from its vertices on construction, so put it in a group to move it.

A `Material` or camera is a class rule in one shared stylesheet, so the objects using it share one style. The rule stays until `[Symbol.dispose]()` is called, or the owner leaves a `using` block; otherwise it is removed once the owner and its elements are garbage-collected.

An orthographic camera needs `setSize()`: without it the container takes the window size at construction and does not follow resizes.

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
