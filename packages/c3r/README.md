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
<script src="https://unpkg.com/c3r@0.5/dist/c3r.min.js"></script>
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

| Class                                     | What it is                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Container`                               | The viewport: `domElement`, `root` group, `camera`, `lights`, `setSize()`, `unitScale`, `bake()` fits it, `toHTML()` (async)                                                                                                                           |
| `Group`                                   | A transformed node: `transform` and `tween` (one or an array each, `[]` resets `transform`), `clock`, `lightGain`, `addChild()`, `addPolygon()`, `addTriangles()` merges into polygons, `addMesh()` takes flat `positions`, `uvs`, `cells`             |
| `Polygon`                                 | A flat, convex or concave textured polygon from CCW vertices, with `uvScale`, `uvOffset`, `textureSize` (set it for a data url, otherwise `bake()` measures it)                                                                                        |
| `ElementObject`                           | Any HTML element in the scene, centered on the origin, with `scale`, `center`, `rotation`                                                                                                                                                              |
| `Billboard`                               | A group that faces the camera                                                                                                                                                                                                                          |
| `ParticleSystem`                          | A group of camera-facing particles, each tweened through its life: `count`, `lifetime`, `lifetimeRandomness`, `mesh`, `particle`                                                                                                                       |
| `CssValue`                                | A CSS value built from factories: `number`, `px`, `rad`, `add`, `sub`, `mul`, `div`, `fn`                                                                                                                                                              |
| `Tween`                                   | A CSS animation of a group or camera: `keyframes` of `Transform` and `Filter` steps, `from`, `duration`, `delay`, `easing`, `loop`, `alternate`, `paused`, `hover`                                                                                     |
| `Transform`, `Filter`                     | Steps from factories: `translate` (scene units), `rotateX`, `rotateY`, `rotateZ`, `scale`, `matrix` (column-major); `opacity`, `brightness`, `contrast`, `saturate`, `grayscale`, `sepia`, `invert`, `hueRotate`, `tint`                               |
| `Material`                                | `background` (`[r, g, b, a]` in 0-1, or an image URL), `filter` (one or an array of `Filter` steps, before a tween's), `doubleSided`, `shading`, `diffuse`, `specular`, inherited by the object's descendants; on an `ElementObject`, its element only |
| `PerspectiveCamera`, `OrthographicCamera` | `transform` (pose), `tween`, and `fov`, or `left`, `right`, `top`, `bottom`                                                                                                                                                                            |

An image's alpha shows through. A color and an image don't combine, tint either with `Filter.tint`. A color hides an inherited image and an image hides an inherited color. An `ElementObject`'s element shows only its own material's background, never a parent's. Every property but `shading`, `diffuse` and `specular` applies on assignment, there is no `update()` to call. A polygon is laid out from its vertices on construction, so put it in a group to move it.

To make a polygon interactive, set `pointer-events: auto` on its `contentElement`, which hits its exact shape, not on its `domElement`, which hits the whole bounding box.

A material's `flipbook = { columns, rows, frames?, fps? }` plays on polygons an image of frames in a grid, in reading order at 30 fps by default, with the uvs covering one cell.

A `Material`, `Tween` or camera is a class rule in one shared stylesheet, so the objects using it share one style. The rule stays until `[Symbol.dispose]()` is called, or the owner leaves a `using` block. Otherwise it is removed once the owner and its elements are garbage-collected. A container that is assigned another camera keeps the old one's rules until then, since cameras can be shared, so pass the camera to `new Container(camera)` instead of replacing the default `PerspectiveCamera`.

A `transform` array applies in order, like CSS. A tween animates a group after its `transform`, from rest or from the `from` steps, and a group's tweens apply in array order. Its keyframes play in sequence, `duration` seconds each unless written as `{ steps, duration }`, and `easing` applies to each; a keyframe is one step or an array of steps, and what it doesn't list holds. Transforms apply in the order they first appear, `from` first. Angles are radians and may exceed a half turn. A `Transform.matrix` keyframe tweens its translation, rotation and scale separately, and can't have shear, perspective or a zero scale. `Filter` steps apply to the polygons and `ElementObject` elements, and a nested group's filters replace its parent's. With `hover`, a `loop` plays only while hovered; any other tween takes one keyframe and eases to it and back. Setting `paused` later pauses everything using the tween; a hover transition can't pause, so it stops responding to hover instead. It runs on the main thread and `bake()` ignores its scale. Use a negative `delay`, in seconds, to offset the phase.

A group's `clock` runs `Group.time`, in seconds, for its own and its descendants' materials. It wraps hourly and restyles the subtree every frame, so it is off by default. Filters other than `hueRotate` and `tint` also take a `CssValue`, such as `Filter.opacity(CssValue.fn("sin", Group.time))`, which a tween can't animate.

`Filter.tint(color)` multiplies each pixel by an sRGB color in 0-1, like a sprite tint. It applies to polygons only, before the other filters, and semi-transparent pixels take a slight tint halo.

A `ParticleSystem` runs without per-frame JS. Its `particle` callback runs once per particle with `random(min, max)` and returns `from`, `keyframes` and `easing` like a `Tween`, durations relative to the life. `lifetimeRandomness` shortens each life by up to that fraction, 0.1 by default. Particles start at random points of their lives and loop. A `Transform.translate` moves one in the scene, the other steps apply after it faces the camera. Its material's flipbook plays once per life, in step only when set before the system is shown.

A `CssValue` comes only from its factories, which refuse text that could escape a declaration.

A material's `shading` darkens its polygons with a grayscale diffuse layer computed in CSS from the container's `lights = { ambient: { intensity }, directional: { direction, intensity } }`, either one optional. Without lights a shaded polygon is black. `"flat"` gives each polygon one shade. `"smooth"` interpolates the optional `normal` of each `Vertex` (`normals` in `addMesh`), or the face's without one, and is slightly dim in the middle of a large triangle. Normals don't affect which triangles merge, a merged polygon fits them as closely as a plane can. A smooth polygon's content box reaches up to 2px past its element, which shifts the children of a custom `contentElement` slightly. Shading paints a `::before` on the content element, which a `canvas` or `img` doesn't have, under positioned children and over the rest. Under either shading, partly transparent texels wash towards the shade. `direction` is the way the light travels, in world space. Shading follows a group's `transform` and its `rotateX`, `rotateY`, `rotateZ` and `scale` tweens, but not a `Transform.matrix` tween or a `Billboard`. Under a scale that isn't uniform or a shear its brightness is approximate, and the back of a `doubleSided` polygon takes the front's shade. It takes effect at the next `bake()`.

A shaded material's `diffuse = { map }` scales the light but not the ambient, with an opaque image on the same uvs, for baked shadows. A value without `map` drops a parent's. It leaves the highlight alone, so pass a shadow to `specular.map` too to stop one.

A shaded material's `specular = { intensity, shininess, map? }` adds a white Blinn-Phong highlight from the `directional` light, inherited like `shading`, on a `::after` of the content element, over positioned children. `intensity: 0` turns it off under a parent. `map` is an image url on the same uvs, its brightness scales the displayed highlight, and another origin needs CORS. The highlight follows the camera's rotation, with its `rotateX`, `rotateY` and `rotateZ` tweens, but not its position, so parallel faces share one. It is somewhat too bright over a lit surface, and a `filter` changes it with the polygon. On a smooth polygon it peaks on a vertex and dims between vertices, so it needs a low shininess or a fine mesh to look round. Each camera turn restyles every polygon with a highlight.

`lights = { ambient, point: { position, intensity } }` replaces `directional` with a light in world space, falling off with the squared distance. Setting both throws, and switching takes effect at the next `bake()`. `"flat"` gives each polygon the shade at its center, unlike three.js, which lights a flat face per pixel. `"smooth"` draws the exact falloff on a plane. On a curve, including a plane joined to one by smooth edges, it interpolates the light at three vertices, so a large polygon close to the light goes too dim or bright. `addMesh(mesh, { splitCurved: true })` avoids seams on merged polygons with differing normals, at twice the polygons on a cylinder. A point light ignores a group's `Transform.matrix` tween and a `Billboard`'s facing, gets distances wrong under a scale that isn't uniform, and on a plane doesn't follow sheared uvs.

`point.tween` moves the light after `position`, so a group with that tween stays on it, and each frame restyles the whole scene. A `Transform.matrix` or filter tween throws.

`specular` works under a point light with the same viewer as `directional`. A flat polygon takes it at its center and a curve from three vertices. On a plane it is an oval on a child added to the content element at each `bake()`, more symmetric than the true shape, too dim where a very bright highlight should saturate, and off towards the light at a grazing view.

`group.lightGain`, a number or a `CssValue` that can read `Group.time`, multiplies the point light below the group. Run the `clock` on that group, on the root each frame restyles the scene.

A `Billboard` undoes every rotation above it and its own, so turn a child group to spin it. A scale that isn't uniform, a shear, or a mirror in a tween skews it.

Aim a camera, or any object, with `Transform.targetTo(eye, target, up = [0, 1, 0])`: it stands at `eye` with its -z axis towards `target`, and throws when `eye` is on `target` or `up` points along the view. A camera's tween moves it after its `transform` (`translate([0, 0, 400])` backs away) and can't `hover` or scale by zero or less. Its filters apply to every group without its own, and `bake()` ignores it.

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
