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

export type Shading = "flat" | "smooth";

export interface Specular {
  readonly intensity: number;
  readonly shininess: number;
  readonly map?: string;
}

// Blur in scene units
export interface Shadows {
  readonly opacity: number;
  readonly blur?: number;
}

export interface Diffuse {
  readonly map?: string;
}

// A newline only has a hex escape
const cssUrl = (url: string) =>
  `url("${url.replace(/["\\\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}")`;

let nextId = 0;

export class Material {
  readonly className = `c3r-material-${nextId++}`;

  #background: ReadonlyVec4 | string | null = null;
  #filter: Filter | readonly Filter[] | null = null;
  #filterKey = "";
  #doubleSided = false;
  #flipbook: Required<Flipbook> | null = null;
  #shading: Shading | null = null;
  #specular: Specular | null = null;
  #diffuse: Diffuse | null = null;
  #shadows: Shadows | null = null;

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
    let backdrop: string | null = null;
    if (typeof background === "string") {
      image = cssUrl(background);
      color = opaque = "transparent";
      alpha = "1";
      backdrop = "white";
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
      backdrop = opaque = `rgb(${rgb.join()})`;
      alpha = String(a);
      this.#background = vec4.clone(background);
    } else {
      this.#background = null;
    }
    this.#set("--c3r-background-image", image);
    this.#set("--c3r-background-color", color);
    this.#set("--c3r-background-opaque", opaque);
    this.#set("--c3r-background-alpha", alpha);
    this.#set("--c3r-shade-backdrop", backdrop);
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
    this.#set("--c3r-backface", doubleSided ? "visible" : null);
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

  // Takes effect at the next bake, which finds the polygons it reaches
  get shading(): Shading | null {
    return this.#shading;
  }

  set shading(shading: Shading | null) {
    if (shading !== null && shading !== "flat" && shading !== "smooth")
      throw new RangeError(`Invalid shading ${shading}`);
    this.#shading = shading;
  }

  get specular(): Specular | null {
    return this.#specular;
  }

  set specular(specular: Specular | null) {
    if (specular) {
      const { intensity, shininess } = specular;
      if (!(intensity >= 0 && Number.isFinite(intensity)))
        throw new RangeError(`Invalid specular intensity ${intensity}`);
      if (!(shininess > 0 && Number.isFinite(shininess)))
        throw new RangeError(`Invalid shininess ${shininess}`);
    }
    const old = this.#specular;
    // Rewriting an unchanged rule would still restyle what uses it
    if (
      specular?.intensity === old?.intensity &&
      specular?.shininess === old?.shininess &&
      specular?.map === old?.map
    )
      return;
    const map = specular?.map ? cssUrl(specular.map) : null;
    this.#specular = specular && Object.freeze({ ...specular });
    this.#set(
      "--c3r-specular-intensity",
      specular && String(specular.intensity),
    );
    this.#set("--c3r-shininess", specular && String(specular.shininess));
    // Explicit, so a child's specular doesn't take its parent's map
    this.#set("--c3r-specular-map", specular && (map ?? "none"));
    // As one layer of several, none would be transparent and hide the rest
    this.#set(
      "--c3r-specular-layer",
      specular && (map ?? "linear-gradient(white, white)"),
    );
  }

  get diffuse(): Diffuse | null {
    return this.#diffuse;
  }

  set diffuse(diffuse: Diffuse | null) {
    const unchanged =
      !diffuse === !this.#diffuse && diffuse?.map === this.#diffuse?.map;
    if (unchanged) return;
    const map = diffuse && (diffuse.map ? cssUrl(diffuse.map) : "none");
    this.#diffuse = diffuse && Object.freeze({ ...diffuse });
    this.#set("--c3r-diffuse-map", map);
  }

  // Darkens where shadow casters block the light, from the next shadow bake
  get shadows(): Shadows | null {
    return this.#shadows;
  }

  set shadows(shadows: Shadows | null) {
    if (shadows) {
      const { opacity, blur = 0 } = shadows;
      if (!(opacity >= 0 && opacity <= 1))
        throw new RangeError(`Invalid shadow opacity ${opacity}`);
      if (!(blur >= 0 && Number.isFinite(blur)))
        throw new RangeError(`Invalid shadow blur ${blur}`);
    }
    this.#shadows = shadows && Object.freeze({ ...shadows });
  }

  #applyFlipbook(): void {
    const values = this.#flipbook;
    // Like a background, its own one hides an inherited flipbook
    const none = this.#background === null ? null : "initial";
    this.#set("--c3r-columns", values ? String(values.columns) : none);
    this.#set("--c3r-rows", values ? String(values.rows) : none);
    this.#set("--c3r-frames", values ? String(values.frames) : none);
    this.#set(
      "--c3r-flipbook-duration",
      values ? `${values.frames / values.fps}s` : none,
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
