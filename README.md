# CSS 3D Renderer

**C3R.js** is a lightweight library for displaying 3D scenes with CSS. It is designed to be used as a CSS3D backend for existing libraries. It provides classes to construct textured polygons, nest 3D transformed elements and handle camera.

| Package                           | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| [`c3r`](packages/c3r)             | The library                                                     |
| [`c3r-three`](packages/c3r-three) | three.js `CSS3DRenderer` replacement with geometry and textures |
| [`c3r-examples`](examples)        | Standalone and ported three.js examples                         |

Try the examples live [here](https://k-adam.github.io/CSS3D-Renderer/examples/).

## Development

Requires Node 20.19+ or 22.12+.

```sh
npm install
npm run build   # packages/*/dist
npm run dev     # build and serve the examples
npm run lint
npm run format
```

`dist/` is not committed; `v*` tags publish a GitHub Release and deploy the examples to Pages.
