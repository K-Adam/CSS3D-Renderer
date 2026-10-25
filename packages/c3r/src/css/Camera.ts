import { mat4, type ReadonlyMat4 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";

let nextId = 0;

// The projection math lives in styles.css, cameras only set its variables
export abstract class Camera {
  readonly className = `c3r-camera-${nextId++}`;
  abstract readonly projectionClass: string;

  #matrix = mat4.create();
  #paramsRule: CSSStyleRule | null = insertRule(`.${this.className}`, this);
  // Changes every frame
  #viewRule: CSSStyleRule | null = insertRule(
    `.${this.className} > .c3r-view`,
    this,
  );

  constructor() {
    this.#writeMatrix();
  }

  // Inverse world
  get matrix(): ReadonlyMat4 {
    return this.#matrix;
  }

  set matrix(matrix: ReadonlyMat4) {
    if (mat4.exactEquals(matrix, this.#matrix)) return;
    mat4.copy(this.#matrix, matrix);
    this.#writeMatrix();
  }

  #writeMatrix(): void {
    this.#viewRule?.style.setProperty(
      "--c3r-camera-view",
      `matrix3d(${[...this.#matrix].join()})`,
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
