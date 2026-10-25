import { vec4, type ReadonlyVec4 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";

let nextId = 0;

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  #backgroundImageSrc: string | null = null;
  #backgroundColor: ReadonlyVec4 | null = null;
  #opacity = 1;

  #rule: CSSStyleRule | null = insertRule(`.${this.className}`, this);

  get backgroundImageSrc(): string | null {
    return this.#backgroundImageSrc;
  }

  set backgroundImageSrc(src: string | null) {
    if (src === this.#backgroundImageSrc) return;
    this.#backgroundImageSrc = src;
    this.#set(
      "--c3r-background-image",
      src && `url("${src.replace(/["\\]/g, "\\$&")}")`,
    );
  }

  // rgba, 0-1
  get backgroundColor(): ReadonlyVec4 | null {
    return this.#backgroundColor;
  }

  set backgroundColor(color: ReadonlyVec4 | null) {
    const old = this.#backgroundColor;
    if (color === old || (color && old && vec4.exactEquals(color, old))) return;
    this.#backgroundColor = color && vec4.clone(color);

    let value = null;
    if (color) {
      const [r, g, b, a] = color;
      const rgb = [r, g, b].map((c) => Math.round(c * 255));
      value = `rgba(${rgb.join()},${a})`;
    }
    this.#set("--c3r-background-color", value);
  }

  get opacity(): number {
    return this.#opacity;
  }

  set opacity(opacity: number) {
    if (opacity === this.#opacity) return;
    this.#opacity = opacity;
    this.#set("--c3r-opacity", opacity === 1 ? null : String(opacity));
  }

  #set(name: string, value: string | null): void {
    const style = this.#rule?.style;
    if (!style) return;
    if (value === null) style.removeProperty(name);
    else style.setProperty(name, value);
  }

  [Symbol.dispose](): void {
    deleteRule(this.#rule);
    this.#rule = null;
  }
}
