import "../polyfill.js";

import { mat4, type ReadonlyMat4 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";
import { setTweens, type Tween } from "./Tween.js";

let nextId = 0;

// The projection math lives in styles.css, cameras only set its variables
export abstract class Camera {
  readonly className = `c3r-camera-${nextId++}`;
  abstract readonly projectionClass: string;

  #matrix = mat4.create();
  #viewMatrix = mat4.create();
  #tween: Tween | readonly Tween[] | null = null;
  #paramsRule: CSSStyleRule | null = insertRule(`.${this.className}`, this);
  // Changes every frame
  #viewRule: CSSStyleRule | null = insertRule(
    `.${this.className} > .c3r-view`,
    this,
  );

  constructor() {
    this.#writeMatrix();
  }

  get matrix(): ReadonlyMat4 {
    return this.#matrix;
  }

  set matrix(matrix: ReadonlyMat4) {
    if (mat4.exactEquals(matrix, this.#matrix)) return;
    if (!mat4.invert(this.#viewMatrix, matrix))
      throw new RangeError("A camera matrix must be invertible");
    mat4.copy(this.#matrix, matrix);
    this.#writeMatrix();
  }

  get viewMatrix(): ReadonlyMat4 {
    return this.#viewMatrix;
  }

  get tween(): Tween | readonly Tween[] | null {
    return this.#tween;
  }

  set tween(tween: Tween | readonly Tween[] | null) {
    const tweens = setTweens(this.#viewRule?.style, tween, true);
    this.#tween = Array.isArray(tween) ? tweens : tween;
  }

  #writeMatrix(): void {
    this.#viewRule?.style.setProperty(
      "--c3r-camera-view",
      `matrix3d(${[...this.#viewMatrix].join()})`,
    );
  }

  // Rewriting an unchanged rule would still restyle the whole scene
  protected setParam(name: string, value: string): void {
    const style = this.#paramsRule?.style;
    if (style && style.getPropertyValue(name) !== value)
      style.setProperty(name, value);
  }

  [Symbol.dispose](): void {
    deleteRule(this.#paramsRule);
    deleteRule(this.#viewRule);
    this.#paramsRule = this.#viewRule = null;
  }
}
