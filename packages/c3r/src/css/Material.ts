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

export interface Flipbook {
  columns: number;
  rows: number;
  frames?: number;
  fps?: number;
}

let nextId = 0;

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  #background: ReadonlyVec4 | string | null = null;
  #filter: Filter | readonly Filter[] | null = null;
  #filterKey = "";
  #doubleSided = false;
  #flipbook: Required<Flipbook> | null = null;

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
    this.#applyFlipbook();
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

  get flipbook(): Readonly<Flipbook> | null {
    return this.#flipbook;
  }

  set flipbook(flipbook: Flipbook | null) {
    let values: Required<Flipbook> | null = null;
    if (flipbook) {
      const { columns, rows, frames = columns * rows, fps = 30 } = flipbook;
      if (![columns, rows, frames].every((n) => Number.isInteger(n) && n > 0))
        throw new RangeError("Flipbook counts must be positive integers");
      if (frames > columns * rows)
        throw new RangeError("More frames than cells");
      if (!(fps > 0 && Number.isFinite(fps)))
        throw new RangeError(`Invalid fps ${fps}`);
      values = Object.freeze({ columns, rows, frames, fps });
    }
    this.#flipbook = values;
    this.#applyFlipbook();
  }

  #applyFlipbook(): void {
    const values = this.#flipbook;
    // Like a background, its own one hides an inherited flipbook
    const none = this.#background === null ? null : "initial";
    this.#set("--c3r-columns", values ? String(values.columns) : none);
    this.#set("--c3r-rows", values ? String(values.rows) : none);
    this.#set("--c3r-frames", values && String(values.frames));
    this.#set(
      "--c3r-flipbook-animation",
      values
        ? `c3r-flipbook ${values.frames / values.fps}s steps(${values.frames}, jump-end) infinite`
        : none,
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
