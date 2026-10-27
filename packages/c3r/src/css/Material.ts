import "../polyfill.js";

import { vec4, type ReadonlyVec4 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";
import { type Filter, filterText } from "./Tween.js";

let nextId = 0;

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  #backgroundImageSrc: string | null = null;
  #backgroundImage: string | null = null;
  #backgroundColor: ReadonlyVec4 | null = null;
  #filter: Filter | readonly Filter[] | null = null;
  #filterText = "";
  #doubleSided = false;

  #rule: CSSStyleRule | null = insertRule(`.${this.className}`, this);

  get backgroundImageSrc(): string | null {
    return this.#backgroundImageSrc;
  }

  set backgroundImageSrc(src: string | null) {
    if (src === this.#backgroundImageSrc) return;
    this.#backgroundImageSrc = src;
    // A newline only has a hex escape
    const escape = (c: string) => `\\${c.charCodeAt(0).toString(16)} `;
    this.#backgroundImage =
      src && `url("${src.replace(/["\\\n\r\f]/g, escape)}")`;
    this.#set("--c3r-background-image", this.#backgroundImage);
    this.#paint();
  }

  // rgba, 0-1
  get backgroundColor(): ReadonlyVec4 | null {
    return this.#backgroundColor;
  }

  set backgroundColor(color: ReadonlyVec4 | null) {
    const old = this.#backgroundColor;
    if (color === old || (color && old && vec4.exactEquals(color, old))) return;
    this.#backgroundColor = color && vec4.clone(color);
    this.#paint();
  }

  get filter(): Filter | readonly Filter[] | null {
    return this.#filter;
  }

  set filter(filter: Filter | readonly Filter[] | null) {
    const text = filterText(filter);
    this.#filter = Array.isArray(filter) ? Object.freeze([...filter]) : filter;
    if (text === this.#filterText) return;
    this.#filterText = text;
    this.#set("--c3r-filter", text || null);
  }

  get doubleSided(): boolean {
    return this.#doubleSided;
  }

  set doubleSided(doubleSided: boolean) {
    if (doubleSided === this.#doubleSided) return;
    this.#doubleSided = doubleSided;
    this.#set("backface-visibility", doubleSided ? "visible" : null);
  }

  // A color layer fills an image's transparent pixels, so only a tint is masked
  #paint(): void {
    const image = this.#backgroundImage;
    const tint = this.#backgroundColor;
    let color = image ? "transparent" : null;
    if (tint) {
      const [r, g, b, a] = tint;
      const rgb = [r, g, b].map((c) => Math.round(c * 255));
      color = `rgba(${rgb.join()},${a})`;
    }
    this.#set("--c3r-background-color", color);
    // "none" so a parent material's mask doesn't inherit
    this.#set(
      "--c3r-mask-image",
      tint ? "var(--c3r-background-image, none)" : image && "none",
    );
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
