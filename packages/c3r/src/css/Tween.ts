import "../polyfill.js";

import type { ReadonlyVec3 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";

interface Step {
  // Registered syntax of a filter argument
  syntax: string | null;
  name: string;
  identity: string;
  value: string;
}

// Only factory-made steps, a forged one would inject raw CSS
const steps = new WeakMap<Transform | Filter, Step>();

const vector = (v: ReadonlyVec3, unit = ""): string => {
  const values = Array.from(v);
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw new RangeError(`Invalid vector ${values}`);
  return values.map((n) => n + unit).join();
};

const radians = (angle: number): string => {
  if (!Number.isFinite(angle)) throw new RangeError(`Invalid angle ${angle}`);
  return `${angle}rad`;
};

const amount = (n: number): string => {
  if (!(n >= 0 && Number.isFinite(n)))
    throw new RangeError(`Invalid amount ${n}`);
  return String(n);
};

export class Transform {
  declare private readonly brand: "transform";

  private constructor() {}

  static #create(name: string, identity: string, value: string): Transform {
    const transform = new Transform();
    steps.set(transform, { syntax: null, name, identity, value });
    return transform;
  }

  // Scene units
  static translate(v: ReadonlyVec3): Transform {
    return Transform.#create("translate3d", "0px,0px,0px", vector(v, "px"));
  }

  static rotateX(angle: number): Transform {
    return Transform.#create("rotateX", "0rad", radians(angle));
  }

  static rotateY(angle: number): Transform {
    return Transform.#create("rotateY", "0rad", radians(angle));
  }

  static rotateZ(angle: number): Transform {
    return Transform.#create("rotateZ", "0rad", radians(angle));
  }

  static scale(s: number | ReadonlyVec3): Transform {
    const v = typeof s === "number" ? [s, s, s] : s;
    return Transform.#create("scale3d", "1,1,1", vector(v));
  }
}

export class Filter {
  declare private readonly brand: "filter";

  private constructor() {}

  static #create(
    name: string,
    identity: string,
    value: string,
    syntax = "<number>",
  ): Filter {
    const filter = new Filter();
    steps.set(filter, { syntax, name, identity, value });
    return filter;
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

  // px of each polygon's element
  static blur(radius: number): Filter {
    return Filter.#create("blur", "0px", `${amount(radius)}px`, "<length>");
  }
}

export function filterText(filter: Filter | readonly Filter[] | null): string {
  return [filter ?? []]
    .flat()
    .map((f) => {
      const step = steps.get(f);
      if (!step?.syntax) throw new TypeError("Not a Filter");
      return `${step.name}(${step.value})`;
    })
    .join(" ");
}

type Steps = Transform | Filter | readonly (Transform | Filter)[];
export type Keyframe = Steps | { steps: Steps; duration?: number };

export interface TweenOptions {
  keyframes: readonly Keyframe[];
  // Seconds per keyframe
  duration?: number;
  delay?: number;
  easing?: string;
  loop?: boolean;
  alternate?: boolean;
  paused?: boolean;
  hover?: boolean;
}

interface Style {
  transform?: string;
  filter?: string;
  animation?: string;
  transition?: string;
}

const styles = new WeakMap<Tween, Style>();

export function tweenStyle(tweens: readonly Tween[]): Record<string, string> {
  const parts = tweens.map((tween) => {
    const part = styles.get(tween);
    if (!part) throw new TypeError("Not a Tween");
    return part;
  });
  const list = (key: keyof Style, separator: string) =>
    parts.flatMap((part) => part[key] ?? []).join(separator);
  return {
    "--c3r-tween-transform": list("transform", " "),
    animation: list("animation", ", "),
    transition: list("transition", ", "),
    "--c3r-tween-filter": list("filter", " "),
  };
}

let nextId = 0;

export class Tween {
  readonly className = `c3r-tween-${nextId++}`;

  #paused = false;
  #rules: CSSRule[] = [];
  #rule: CSSStyleRule | null;
  #hoverRule: CSSStyleRule | null = null;
  #hoverCssText: string | null = null;

  constructor({
    keyframes,
    duration = 1,
    delay = 0,
    easing = "linear",
    loop = false,
    alternate = false,
    paused = false,
    hover = false,
  }: TweenOptions) {
    // Each keyframe changes what it lists, the rest holds
    const pose = new Map<string, Step>();
    const stops = [new Map<string, Step>()];
    const times = [0];
    for (const keyframe of keyframes) {
      const { steps: changes, duration: time = duration } =
        "steps" in keyframe ? keyframe : { steps: keyframe };
      if (!(time > 0 && Number.isFinite(time)))
        throw new RangeError(`Invalid duration ${time}`);
      const names = new Set<string>();
      for (const change of [changes].flat()) {
        const step = steps.get(change);
        if (!step) throw new TypeError("Not a Transform or Filter");
        if (names.has(step.name))
          throw new RangeError(`${step.name} twice in a keyframe`);
        names.add(step.name);
        pose.set(step.name, step);
      }
      stops.push(new Map(pose));
      times.push(times[times.length - 1] + time);
    }
    if (!pose.size) throw new RangeError("A tween needs a Transform or Filter");
    // CSS drops an invalid value and strips comments
    const { style: probe } = document.createElement("div");
    probe.setProperty("transition-timing-function", easing);
    const timingFunction = probe.getPropertyValue("transition-timing-function");
    // Only one easing fits the shorthands, and a server-side DOM keeps any text
    let depth = 0;
    let malformed = false;
    for (const c of timingFunction) {
      depth += c === "(" ? 1 : c === ")" ? -1 : 0;
      if (depth < 0 || (c === "," && !depth)) malformed = true;
    }
    if (
      !timingFunction ||
      malformed ||
      depth ||
      /^\s*(inherit|initial|unset|revert(-layer)?)\s*$|\b(var|env|attr)\(|[^\w\s().,%+\-/]/i.test(
        timingFunction,
      )
    )
      throw new RangeError(`Invalid easing ${easing}`);
    if (!Number.isFinite(delay)) throw new RangeError(`Invalid delay ${delay}`);
    // A transition reverses from where it is when the pointer leaves
    const transition = hover && !loop;
    if (transition && keyframes.length > 1)
      throw new RangeError("A hover transition takes one keyframe");
    if (alternate && !loop) throw new RangeError("Alternate needs loop");

    // Its own properties, so tweens on one element don't clash
    const track = `--${this.className}`;
    const property = (s: Step) => `${track}-${s.name}`;
    const used = [...pose.values()];
    const transforms = used.filter((s) => !s.syntax);
    const filters = used.filter((s) => s.syntax);
    const frame = (stop: Map<string, Step>) => {
      const value = (s: Step) => stop.get(s.name)?.value ?? s.identity;
      const declarations: [string, string][] = [];
      // The same functions at every stop, so each one interpolates on its own
      if (transforms.length) {
        const list = transforms.map((s) => `${s.name}(${value(s)})`);
        declarations.push([track, list.join(" ")]);
      }
      for (const s of filters) declarations.push([property(s), value(s)]);
      return declarations;
    };
    const cssText = (stop: Map<string, Step>) =>
      frame(stop)
        .map(([name, value]) => `${name}: ${value}`)
        .join("; ");
    const total = times[times.length - 1];

    this.#rule = insertRule(`.${this.className}`, this);
    this.#rules.push(this.#rule);
    const { style } = this.#rule;

    // Registered to interpolate
    const register = (name: string, syntax: string, initial: string) =>
      this.#rules.push(
        insertRule(
          `@property ${name}`,
          this,
          `{ syntax: "${syntax}"; inherits: false; initial-value: ${initial}; }`,
        ),
      );
    if (transforms.length) register(track, "<transform-list>", "translate(0)");
    for (const s of filters) register(property(s), s.syntax!, s.identity);

    if (!transition) {
      const blocks = stops.map(
        (stop, i) => `${(times[i] / total) * 100}% { ${cssText(stop)} }`,
      );
      this.#rules.push(
        insertRule(
          `@keyframes ${this.className}`,
          this,
          `{ ${blocks.join(" ")} }`,
        ),
      );
    }
    // The view disables pointer events, polygons inherit this instead
    if (hover) style.setProperty("pointer-events", "auto");

    const timing = `${timingFunction} ${delay}s`;
    // Fallbacks keep the element's other tweens when this one is disposed
    const part: Style = {};
    if (transforms.length) part.transform = `var(${track},)`;
    // Inherited as resolved text, a filter on the group would flatten it
    if (filters.length) {
      part.filter = filters
        .map((s) => `${s.name}(var(${property(s)}, ${s.identity}))`)
        .join(" ");
    }
    if (transition) {
      const rest = frame(stops[0]);
      for (const [name, value] of rest) style.setProperty(name, value);
      style.setProperty(
        `${track}-transition`,
        rest.map(([name]) => `${name} ${total}s ${timing}`).join(", "),
      );
      part.transition = `var(${track}-transition, ${track} 0s)`;
      this.#hoverCssText = cssText(stops[1]);
      this.#hoverRule = insertRule(`.${this.className}:hover`, this);
    } else {
      const count = loop ? "infinite" : 1;
      const direction = alternate ? "alternate" : "normal";
      style.setProperty(
        `${track}-animation`,
        `${this.className} ${total}s ${timing} ${count} ${direction} both var(${track}-state)`,
      );
      part.animation = `var(${track}-animation, none)`;
      if (hover) {
        // More specific than the class rule, which keeps paused while hovered
        this.#hoverRule = insertRule(
          `.${this.className}:not(:hover)`,
          this,
          `{ ${track}-state: paused }`,
        );
      }
    }
    if (this.#hoverRule) this.#rules.push(this.#hoverRule);
    styles.set(this, part);
    this.paused = paused;
  }

  // Pauses every object using it; CSS can't pause a transition, so a hover
  // transition is disabled instead
  get paused(): boolean {
    return this.#paused;
  }

  set paused(paused: boolean) {
    this.#paused = paused;
    if (this.#hoverCssText === null) {
      this.#rule?.style.setProperty(
        `--${this.className}-state`,
        paused ? "paused" : "running",
      );
    } else if (this.#hoverRule) {
      this.#hoverRule.style.cssText = paused ? "" : this.#hoverCssText;
    }
  }

  [Symbol.dispose](): void {
    for (const rule of this.#rules) deleteRule(rule);
    this.#rules = [];
    this.#rule = this.#hoverRule = null;
  }
}
