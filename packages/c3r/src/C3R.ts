export {
  type Diffuse,
  type Flipbook,
  Material,
  type Shading,
  type Shadows,
  type Specular,
} from "./css/Material.js";
export { Filter } from "./css/Filter.js";
export { Transform } from "./css/Transform.js";
export { type CssFunction, CssValue } from "./css/CssValue.js";
export { type Keyframe, Tween, type TweenOptions } from "./css/Tween.js";
export { Timeline, type TimelineOptions } from "./css/Timeline.js";
export { cssText, styleHTML } from "./css/styles.js";

export { Object3D } from "./dom/Object3D.js";
export { Group, type IndexedMesh, type MeshOptions } from "./dom/Group.js";
export { type BakeOptions, Container, type Lights } from "./dom/Container.js";
export { Polygon, type PolygonOptions } from "./dom/Polygon.js";
export { ElementObject } from "./dom/ElementObject.js";
export { Billboard } from "./dom/Billboard.js";
export { holdsLight, type ShadowCaster } from "./dom/Shadows.js";
export {
  ParticleSystem,
  type ParticleSystemOptions,
} from "./dom/ParticleSystem.js";

export type { Vertex } from "./math/Vertex.js";
export {
  MeshBuilder,
  type MeshFace,
  type TriangleList,
} from "./math/MeshBuilder.js";
export type { EdgeNeighbour, Fold, NeighbourSide } from "./math/planar.js";

export { Camera } from "./css/Camera.js";
export { PerspectiveCamera } from "./css/PerspectiveCamera.js";
export { OrthographicCamera } from "./css/OrthographicCamera.js";
