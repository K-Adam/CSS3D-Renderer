import "../polyfill.js";

import { mat4, type ReadonlyMat4 } from "gl-matrix";

import { refreshCamera } from "../dom/Accumulator.js";

import { deleteRule, insertRule } from "./styles.js";
import {
  allFinite,
  composeTransforms,
  matrixText,
  ownTransform,
  type Transform,
} from "./Transform.js";
import { setTweens, type Tween } from "./Tween.js";

let nextId = 0;

const viewMatrices = new WeakMap<Camera, mat4>();

export const viewMatrixOf = (camera: Camera): ReadonlyMat4 =>
  viewMatrices.get(camera)!;

// The projection math lives in styles.css, cameras only set its variables
export abstract class Camera {
  readonly className = `c3r-camera-${nextId++}`;
  abstract readonly projectionClass: string;

  #transform: Transform | readonly Transform[] = [];
  #tween: Tween | readonly Tween[] | null = null;
  #paramsRule: CSSStyleRule | null = insertRule(`.${this.className}`, this);
  // Changes every frame
  #viewRule: CSSStyleRule | null = insertRule(
    `.${this.className} > .c3r-view`,
    this,
  );

  constructor() {
    viewMatrices.set(this, mat4.create());
    this.#writeMatrix();
  }

  get transform(): Transform | readonly Transform[] {
    return this.#transform;
  }

  set transform(transform: Transform | readonly Transform[]) {
    const view = mat4.invert(mat4.create(), composeTransforms(transform));
    if (!view || !allFinite(view))
      throw new RangeError("A camera transform must be invertible");
    this.#transform = ownTransform(transform);
    const current = viewMatrices.get(this)!;
    if (mat4.exactEquals(view, current)) return;
    mat4.copy(current, view);
    this.#writeMatrix();
    this.#refresh();
  }

  get tween(): Tween | readonly Tween[] | null {
    return this.#tween;
  }

  set tween(tween: Tween | readonly Tween[] | null) {
    const tweens = setTweens(this.#viewRule?.style, tween, true);
    this.#tween = Array.isArray(tween) ? tweens : tween;
    this.#refresh();
  }

  #writeMatrix(): void {
    this.#viewRule?.style.setProperty(
      "--c3r-camera-view",
      matrixText(viewMatrixOf(this)),
    );
  }

  // Not from the constructor, an input rule may read a subclass's fields,
  // which exist once it sets its params
  #refresh(): void {
    const style = this.#viewRule?.style;
    if (style) refreshCamera(this, style);
  }

  // Rewriting an unchanged rule would still restyle the whole scene
  protected setParam(name: string, value: string): void {
    const style = this.#paramsRule?.style;
    if (!style || style.getPropertyValue(name) === value) return;
    style.setProperty(name, value);
    this.#refresh();
  }

  [Symbol.dispose](): void {
    deleteRule(this.#paramsRule);
    deleteRule(this.#viewRule);
    this.#paramsRule = this.#viewRule = null;
  }
}
