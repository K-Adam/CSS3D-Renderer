import type { vec4 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";

let nextId = 0;

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  backgroundImageSrc: string | null = null;
  backgroundColor: vec4 | null = null; // rgba, 0-1
  opacity = 1.0;

  #rule: CSSStyleRule | null = null;

  update(): void {
    this.#rule ??= insertRule(`.${this.className}`, this);

    const { style } = this.#rule;

    if (this.backgroundImageSrc) {
      style.setProperty(
        "--background-image",
        `url("${this.backgroundImageSrc.replace(/["\\]/g, "\\$&")}")`,
      );
    } else {
      style.removeProperty("--background-image");
    }

    if (this.backgroundColor) {
      const [r, g, b, a] = this.backgroundColor;
      const rgb = [r, g, b].map((c) => Math.round(c * 255));
      style.setProperty("--background-color", `rgba(${rgb.join()},${a})`);
    } else {
      style.removeProperty("--background-color");
    }

    if (this.opacity === 1.0) {
      style.removeProperty("--opacity");
    } else {
      style.setProperty("--opacity", String(this.opacity));
    }
  }

  [Symbol.dispose](): void {
    deleteRule(this.#rule);
    this.#rule = null;
  }
}
