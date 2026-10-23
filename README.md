# CSS 3D Renderer

**C3R.js** is a lightweight library for displaying 3D scenes with CSS. It is designed to be used as a CSS3D backend for existing libraries. It provides classes to construct textured polygons, nest 3D transformed elements and handle camera.

| Package                           | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| [`c3r`](packages/c3r)             | The library                                                     |
| [`c3r-three`](packages/c3r-three) | three.js `CSS3DRenderer` replacement with geometry and textures |
| [`c3r-examples`](examples)        | Standalone and ported three.js examples                         |

Try the examples live [here](https://k-adam.github.io/CSS3D-Renderer/examples/).

## Development

Requires Node 20.19+.

```sh
npm install
npm run build   # packages/*/dist
npm run lint
npm run format
```

The built `dist/` folders are committed, so GitHub Pages can serve the examples. To view them locally, serve the repository root with any static server.
