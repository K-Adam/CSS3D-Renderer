import { mat4 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";

let nextId = 0;

// The projection math lives in styles.css, cameras only set its variables
export abstract class Camera {
  readonly className = `c3r-camera-${nextId++}`;
  abstract readonly type: string;

  // Inverse world
  matrix: mat4 = mat4.create();

  #paramsRule: CSSStyleRule | null = null;
  #viewRule: CSSStyleRule | null = null; // changes every frame

  update(): void {
    this.#paramsRule ??= insertRule(`.${this.className}`, this);
    this.#viewRule ??= insertRule(`.${this.className} > .c3r-view`, this);

    // Rewriting an unchanged rule would still restyle the whole scene
    const { style } = this.#paramsRule;
    for (const [name, value] of Object.entries(this.params())) {
      if (style.getPropertyValue(name) !== value)
        style.setProperty(name, value);
    }

    this.#viewRule.style.setProperty(
      "--camera-view",
      `matrix3d(${[...this.matrix].join()})`,
    );
  }

  protected abstract params(): Record<string, string>;

  [Symbol.dispose](): void {
    deleteRule(this.#paramsRule);
    deleteRule(this.#viewRule);
    this.#paramsRule = this.#viewRule = null;
  }
}
