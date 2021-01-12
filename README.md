# CSS 3D Renderer

**C3R.js** is a lightweight library for displaying 3D scenes with CSS. It is designed to be used as a CSS3D backend for existing libraries. It provides classes to construct textured polygons, nest 3D transformed elements and handle camera.

## Usage

Just include `C3R.standalone.js` to your project, or include both `C3R.min.js` and `glMatrix`

## Examples

The example projects be found in the *examples* directory. You can try them out live [here](https://k-adam.github.io/CSS3D-Renderer/examples/) 

I replaced the original CSS3D renderer of Three.js with a **C3R.js** based implementation, which supports buffergeometry and textures as well. It can be found at *examples/js/renderers/CSS3DRenderer.js*
