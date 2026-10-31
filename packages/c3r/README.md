# c3r

Renders textured 3D scenes with plain DOM elements and CSS transforms, as a CSS3D backend for libraries like three.js. You build the scene from textured polygons and HTML elements, nest them in transformed groups and view them through a perspective or orthographic camera.

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
<script src="https://unpkg.com/c3r@0.4/dist/c3r.min.js"></script>
```

It bundles gl-matrix and exposes a `C3R` global.

TypeScript declarations are included.

## API

```js
import { Container, Group, Material, Transform } from "c3r";
import { cube } from "primitive-geometry";

const container = new Container(); // fills the window until setSize()
document.body.append(container.domElement);

const box = new Group();
container.root.addChild(box);
box.addMesh(cube({ sx: 200 }));

box.material = new Material();
box.material.background = "crate.jpg";

container.camera.transform = Transform.translate([0, 0, 400]);
```

| Class                                     | What it is                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Container`                               | The viewport: `domElement`, `root` group, `camera`, `setSize()`, `unitScale`, `bake()` fits it, `toHTML()` (async)                                                                                                            |
| `Group`                                   | A transformed node: `transform` and `tween` (one or an array each, `[]` resets `transform`), `clock`, `addChild()`, `addPolygon()`, `addTriangles()` merges into polygons, `addMesh()` takes flat `positions`, `uvs`, `cells` |
| `Polygon`                                 | A flat, convex or concave textured polygon from CCW vertices, with `uvScale`, `uvOffset`, `textureSize` (set it for a data url, otherwise `bake()` measures it)                                                               |
| `ElementObject`                           | Any HTML element in the scene, centered on the origin, with `scale`, `center`, `rotation`                                                                                                                                     |
| `Billboard`                               | A group that faces the camera                                                                                                                                                                                                 |
| `ParticleSystem`                          | A group of camera-facing particles, each tweened through its life: `count`, `lifetime`, `lifetimeRandomness`, `mesh`, `particle`                                                                                              |
| `CssValue`                                | A CSS value built from factories: `number`, `px`, `rad`, `add`, `sub`, `mul`, `div`, `fn`                                                                                                                                     |
| `Tween`                                   | A CSS animation of a group or camera: `keyframes` of `Transform` and `Filter` steps, `from`, `duration`, `delay`, `easing`, `loop`, `alternate`, `paused`, `hover`                                                            |
| `Transform`, `Filter`                     | Steps from factories: `translate` (scene units), `rotateX`, `rotateY`, `rotateZ`, `scale`, `matrix` (column-major); `opacity`, `brightness`, `contrast`, `saturate`, `grayscale`, `sepia`, `invert`, `hueRotate`, `tint`      |
| `Material`                                | `background` (`[r, g, b, a]` in 0-1, or an image URL), `filter` (one or an array of `Filter` steps, before a tween's), `doubleSided`, inherited by the object's descendants; on an `ElementObject`, its element only          |
| `PerspectiveCamera`, `OrthographicCamera` | `transform` (pose), `tween`, and `fov`, or `left`, `right`, `top`, `bottom`                                                                                                                                                   |

An image's alpha shows through. A color and an image don't combine, tint either with `Filter.tint`; a color hides an inherited image and an image hides an inherited color. Every property applies on assignment; there is no `update()` to call. A polygon is laid out from its vertices on construction, so put it in a group to move it.

A material's `flipbook = { columns, rows, frames?, fps? }` plays on polygons an image of frames in a grid, in reading order at 30 fps by default, with the uvs covering one cell.

A `Material`, `Tween` or camera is a class rule in one shared stylesheet, so the objects using it share one style. The rule stays until `[Symbol.dispose]()` is called, or the owner leaves a `using` block; otherwise it is removed once the owner and its elements are garbage-collected.

A `transform` array applies in order, like CSS. A tween animates a group after its `transform`, from rest or from the `from` steps, and a group's tweens apply in array order. Its keyframes play in sequence, `duration` seconds each unless written as `{ steps, duration }`, and `easing` applies to each; a keyframe is one step or an array of steps, and what it doesn't list holds. Transforms apply in the order they first appear, `from` first. Angles are radians and may exceed a half turn. A `Transform.matrix` keyframe tweens its translation, rotation and scale separately, and can't have shear, perspective or a zero scale. `Filter` steps apply to the polygons and `ElementObject` elements, and a nested group's filters replace its parent's. With `hover`, a `loop` plays only while hovered; any other tween takes one keyframe and eases to it and back. Setting `paused` later pauses everything using the tween; a hover transition can't pause, so it stops responding to hover instead. It runs on the main thread and `bake()` ignores its scale. Use a negative `delay`, in seconds, to offset the phase.

A group's `clock` runs `Group.time`, in seconds, for its own and its descendants' materials. It wraps hourly and restyles the subtree every frame, so it is off by default. Filters other than `hueRotate` and `tint` also take a `CssValue`, such as `Filter.opacity(CssValue.fn("sin", Group.time))`, which a tween can't animate.

`Filter.tint(color)` multiplies each pixel by an sRGB color in 0-1, like a sprite tint. It applies to polygons only, before the other filters, and semi-transparent pixels take a slight tint halo.

A `ParticleSystem` runs without per-frame JS. Its `particle` callback runs once per particle with `random(min, max)` and returns `from`, `keyframes` and `easing` like a `Tween`, durations relative to the life. `lifetimeRandomness` shortens each life by up to that fraction, 0.1 by default. Particles start at random points of their lives and loop. A `Transform.translate` moves one in the scene, the other steps apply after it faces the camera. Its material's flipbook plays once per life, in step only when set before the system is shown.

A `CssValue` comes only from its factories, which refuse text that could escape a declaration.

A `Billboard` undoes every rotation above it and its own, so turn a child group to spin it. A scale that isn't uniform, a shear, or a mirror in a tween skews it.

Aim a camera with gl-matrix (install it): `Transform.matrix(mat4.targetTo(mat4.create(), eye, target, [0, 1, 0]))`. Its tween moves it after its `transform` (`translate([0, 0, 400])` backs away) and can't `hover` or scale by zero or less; its filters apply to every group without its own, and `bake()` ignores it.

On a live page, call `container.bake()` after building, heavily scaling or changing textures; `toHTML()` awaits it for you. It also sizes polygons to their image's texels, loading each url once.

The stylesheet is adopted by `document` only, so a container inside a shadow root is unstyled.

## Node

C3R builds plain DOM elements, so it runs on a server-side DOM like [happy-dom](https://github.com/capricorn86/happy-dom). Stylesheets are not serialized, so export with `toHTML()`: the container markup after a `<style>` of the base styles plus the material, tween and camera rules. `styleHTML()` returns that `<style>` alone. There is no layout either, so a container fills the window unless sized explicitly.

To measure textures, let happy-dom load them from a local folder:

```sh
npm install c3r @happy-dom/global-registrator
```

```js
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({
  url: "http://localhost/",
  settings: {
    enableImageFileLoading: true,
    fetch: { virtualServers: [{ url: "/assets/", directory: "./public" }] },
  },
});

const { Container } = await import("c3r");

const container = new Container();
// ... build the scene

const html = `<!doctype html>${await container.toHTML()}`;
```

See the [examples](https://k-adam.github.io/CSS3D-Renderer/).
