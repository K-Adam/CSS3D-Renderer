import type { ReadonlyVec3 } from "gl-matrix";

import {
  type Kind,
  radians,
  register,
  type Step,
  stepOf,
  stepText,
} from "./steps.js";

const amount = (n: number): string => {
  if (!(n >= 0 && Number.isFinite(n)))
    throw new RangeError(`Invalid amount ${n}`);
  return String(n);
};

export class Filter {
  declare private readonly brand: "filter";

  private constructor() {}

  static #create(
    name: string,
    identity: string,
    value: string,
    syntax = "<number>",
    kind: Kind = "filter",
  ): Filter {
    return register(new Filter(), {
      name,
      kind,
      syntax,
      identity,
      values: [value],
    });
  }

  static opacity(n: number): Filter {
    return Filter.#create("opacity", "1", amount(n));
  }

  static brightness(n: number): Filter {
    return Filter.#create("brightness", "1", amount(n));
  }

  static contrast(n: number): Filter {
    return Filter.#create("contrast", "1", amount(n));
  }

  static saturate(n: number): Filter {
    return Filter.#create("saturate", "1", amount(n));
  }

  static grayscale(n: number): Filter {
    return Filter.#create("grayscale", "0", amount(n));
  }

  static sepia(n: number): Filter {
    return Filter.#create("sepia", "0", amount(n));
  }

  static invert(n: number): Filter {
    return Filter.#create("invert", "0", amount(n));
  }

  static hueRotate(angle: number): Filter {
    return Filter.#create("hue-rotate", "0rad", radians(angle), "<angle>");
  }

  // Multiplies each pixel by an sRGB color
  static tint(color: ReadonlyVec3): Filter {
    const values = Array.from(color);
    if (values.length !== 3 || !values.every((c) => c >= 0 && c <= 1))
      throw new RangeError(`Invalid color ${values}`);
    // Legacy rgb() interpolates in sRGB, so a tween tints linearly
    const rgb = values.map((c) => `${c * 100}%`).join(" ");
    return Filter.#create("tint", "white", `rgb(${rgb})`, "<color>", "layer");
  }
}

export const filterSteps = (
  filter: Filter | readonly Filter[] | null,
): Step[] =>
  [filter ?? []].flat().map((f) => {
    const step = stepOf(f);
    if (!step || step.kind === "transform") throw new TypeError("Not a Filter");
    return step;
  });

// Any filter replaces the parent's filters and layers, none inherits them
export function filterVariables(
  prefix: string,
  filter: string,
  layers: string,
): Record<string, string> {
  const unset = filter || layers ? "initial" : "";
  return {
    [`${prefix}filter`]: filter || unset,
    [`${prefix}layers`]: layers || unset,
    [`${prefix}layered`]: layers ? "alpha" : unset,
  };
}

// Background layers must be images, a solid color has no image form yet
const layerText = (color: string) => `linear-gradient(${color}, ${color}),`;

export function filterTexts(
  steps: Step[],
  args = (step: Step) => step.values,
): { filter: string; layers: string } {
  const of = (kind: Kind) => steps.filter((s) => s.kind === kind);
  return {
    filter: of("filter")
      .map((s) => stepText(s, args(s)))
      .join(" "),
    layers: of("layer")
      .map((s) => layerText(args(s)[0]))
      .join(" "),
  };
}
