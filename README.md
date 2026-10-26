# CSS 3D Renderer

Display textured 3D scenes with plain DOM elements and CSS transforms.

| Package                           | Description                                          |
| --------------------------------- | ---------------------------------------------------- |
| [`c3r`](packages/c3r)             | The library                                          |
| [`c3r-three`](packages/c3r-three) | three.js renderer (r160+) with geometry and textures |
| [`c3r-examples`](examples)        | Standalone and ported three.js examples              |

Try the examples live [here](https://k-adam.github.io/CSS3D-Renderer/).

## Install

`npm install c3r`, or `npm install c3r-three three` for three.js. Prebuilt files are on [GitHub Releases](https://github.com/K-Adam/CSS3D-Renderer/releases).

## Development

Requires Node 24+. The packages are written in TypeScript.

```sh
npm install
npm run build      # packages/*/dist, with type declarations
npm run dev        # serve the examples
npm run typecheck  # tsc in strict mode, also the linter
npm run format
```
