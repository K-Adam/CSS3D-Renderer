import "../polyfill.js";

import { vec4, type ReadonlyVec4 } from "gl-matrix";

import {
  type Filter,
  filterSteps,
  filterTexts,
  filterVariables,
} from "./Filter.js";
import { loadImage } from "./images.js";
import { deleteRule, insertRule } from "./styles.js";

let nextId = 0;

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  #background: ReadonlyVec4 | string | null = null;
  #filter: Filter | readonly Filter[] | null = null;
  #filterKey = "";
  #doubleSided = false;

  #rule: CSSStyleRule | null = insertRule(`.${this.className}`, this);

  // An rgba color, 0-1, or an image url; either hides the other from a parent
  get background(): ReadonlyVec4 | string | null {
    return this.#background;
  }

  set background(background: ReadonlyVec4 | string | null) {
    // url("") would load the page itself
    if (background === "") background = null;
    const old = this.#background;
    const same =
      typeof background === "object" &&
      typeof old === "object" &&
      background &&
      old
        ? vec4.exactEquals(background, old)
        : background === old;
    if (same) return;
    let image: string | null = null;
    let color: string | null = null;
    let opaque: string | null = null;
    let alpha: string | null = null;
    if (typeof background === "string") {
      // A newline only has a hex escape
      const escape = (c: string) => `\\${c.charCodeAt(0).toString(16)} `;
      image = `url("${background.replace(/["\\\n\r\f]/g, escape)}")`;
      color = opaque = "transparent";
      alpha = "1";
      this.#background = background;
      void loadImage(background).then((info) => {
        if (info?.opaque && this.#background === background)
          this.#set("--c3r-alpha-mask", "none");
      });
    } else if (background) {
      const [r, g, b, a] = background;
      const rgb = [r, g, b].map((c) => Math.round(c * 255));
      image = "none";
      color = `rgba(${rgb.join()},${a})`;
      // Faded by opacity on polygons, so a tint stays exact
      opaque = `rgb(${rgb.join()})`;
      alpha = String(a);
      this.#background = vec4.clone(background);
    } else {
      this.#background = null;
    }
    this.#set("--c3r-background-image", image);
    this.#set("--c3r-background-color", color);
    this.#set("--c3r-background-opaque", opaque);
    this.#set("--c3r-background-alpha", alpha);
    // Masks a tint layer out of transparent pixels
    this.#set("--c3r-alpha-mask", image);
  }

  get filter(): Filter | readonly Filter[] | null {
    return this.#filter;
  }

  set filter(filter: Filter | readonly Filter[] | null) {
    const texts = filterTexts(filterSteps(filter));
    this.#filter = Array.isArray(filter) ? Object.freeze([...filter]) : filter;
    const key = `${texts.filter}\n${texts.layers}`;
    if (key === this.#filterKey) return;
    this.#filterKey = key;
    const variables = filterVariables("--c3r-", texts.filter, texts.layers);
    for (const [name, value] of Object.entries(variables))
      this.#set(name, value || null);
  }

  get doubleSided(): boolean {
    return this.#doubleSided;
  }

  set doubleSided(doubleSided: boolean) {
    if (doubleSided === this.#doubleSided) return;
    this.#doubleSided = doubleSided;
    this.#set("backface-visibility", doubleSided ? "visible" : null);
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
