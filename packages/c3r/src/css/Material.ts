import type { vec4 } from "gl-matrix";

import { ensureStyles } from "./styles.js";

// Safari
(Symbol as { dispose?: symbol }).dispose ??= Symbol.for("Symbol.dispose");

let nextId = 0;

function deleteRule(rule: CSSStyleRule) {
  const sheet = rule.parentStyleSheet;
  const i = sheet ? Array.from(sheet.cssRules).indexOf(rule) : -1;
  if (i >= 0) sheet!.deleteRule(i);
}

// For undisposed Materials
const registry = new FinalizationRegistry(deleteRule);

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  backgroundImageSrc: string | null = null;
  backgroundColor: vec4 | null = null; // rgba, 0-1
  opacity = 1.0;

  #rule: CSSStyleRule | null = null;

  update(): void {
    if (!this.#rule) {
      const sheet = ensureStyles();
      const i = sheet.insertRule(
        `.${this.className} {}`,
        sheet.cssRules.length,
      );
      this.#rule = sheet.cssRules[i] as CSSStyleRule;
      registry.register(this, this.#rule, this);
    }

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
    if (this.#rule) {
      registry.unregister(this);
      deleteRule(this.#rule);
    }
    this.#rule = null;
  }
}
