import "../polyfill.js";

import type { ReadonlyVec3 } from "gl-matrix";

import { deleteRule, insertRule } from "./styles.js";

interface Step {
  name: string;
  syntax: string;
  identity: string;
  values: string[];
  // Set on transforms only, which also tells them from filters
  invert?: (value: string) => string;
}

// Only factory-made steps, a forged one would inject raw CSS
const steps = new WeakMap<Transform | Filter, Step>();

const vector = (v: ReadonlyVec3, unit = ""): string[] => {
  const values = Array.from(v);
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw new RangeError(`Invalid vector ${values}`);
  return values.map((n) => n + unit);
};

const negate = (value: string) => `calc(-1 * ${value})`;

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

  static #create(
    name: string,
    syntax: string,
    identity: string,
    values: string[],
    invert = negate,
  ): Transform {
    const transform = new Transform();
    steps.set(transform, { name, syntax, identity, values, invert });
    return transform;
  }

  // Scene units
  static translate(v: ReadonlyVec3): Transform {
    return Transform.#create("translate3d", "<length>", "0px", vector(v, "px"));
  }

  static rotateX(angle: number): Transform {
    return Transform.#create("rotateX", "<angle>", "0rad", [radians(angle)]);
  }

  static rotateY(angle: number): Transform {
    return Transform.#create("rotateY", "<angle>", "0rad", [radians(angle)]);
  }

  static rotateZ(angle: number): Transform {
    return Transform.#create("rotateZ", "<angle>", "0rad", [radians(angle)]);
  }

  static scale(s: number | ReadonlyVec3): Transform {
    const v = typeof s === "number" ? [s, s, s] : s;
    return Transform.#create(
      "scale3d",
      "<number>",
      "1",
      vector(v),
      (value) => `calc(1 / ${value})`,
    );
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
    steps.set(filter, { name, syntax, identity, values: [value] });
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
      if (!step || step.invert) throw new TypeError("Not a Filter");
      return `${step.name}(${step.values[0]})`;
    })
    .join(" ");
}

type Steps = Transform | Filter | readonly (Transform | Filter)[];
export type Keyframe = Steps | { steps: Steps; duration?: number };

export interface TweenOptions {
  keyframes: readonly Keyframe[];
  from?: Steps;
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
  inverse?: string;
  filter?: string;
  animation?: string;
  transition?: string;
  hover?: boolean;
}

const styles = new WeakMap<Tween, Style>();

// Throws before writing anything
export function setTweens(
  style: CSSStyleDeclaration | undefined,
  tween: Tween | readonly Tween[] | null,
  inverse = false,
): readonly Tween[] {
  const tweens = Object.freeze([...new Set([tween ?? []].flat())]);
  const parts = tweens.map((tween) => {
    const part = styles.get(tween);
    if (!part) throw new TypeError("Not a Tween");
    if (inverse && part.hover) throw new RangeError("A camera can't hover");
    return part;
  });
  const list = (key: keyof Style, separator: string, from = parts) =>
    from.flatMap((part) => part[key] ?? []).join(separator);
  const properties = {
    "--c3r-tween-transform": inverse
      ? list("inverse", " ", parts.toReversed())
      : list("transform", " "),
    animation: list("animation", ", "),
    transition: list("transition", ", "),
    "--c3r-tween-filter": list("filter", " "),
  };
  for (const [name, value] of Object.entries(properties)) {
    if (value) style?.setProperty(name, value);
    else style?.removeProperty(name);
  }
  return tweens;
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
    from = [],
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
    const apply = (changes: Steps, where: string) => {
      const names = new Set<string>();
      for (const change of [changes].flat()) {
        const step = steps.get(change);
        if (!step) throw new TypeError("Not a Transform or Filter");
        if (names.has(step.name))
          throw new RangeError(`${step.name} twice in ${where}`);
        names.add(step.name);
        pose.set(step.name, step);
      }
      return names.size;
    };
    apply(from, "from");
    const stops = [new Map(pose)];
    const times = [0];
    let moves = 0;
    for (const keyframe of keyframes) {
      const { steps: changes, duration: time = duration } =
        "steps" in keyframe ? keyframe : { steps: keyframe };
      if (!(time > 0 && Number.isFinite(time)))
        throw new RangeError(`Invalid duration ${time}`);
      moves += apply(changes, "a keyframe");
      stops.push(new Map(pose));
      times.push(times[times.length - 1] + time);
    }
    if (!moves) throw new RangeError("A tween needs a Transform or Filter");
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
    // One per argument, so a camera can invert them
    const property = (s: Step, i: number) =>
      `${track}-${s.name}${s.values.length > 1 ? `-${"xyz"[i]}` : ""}`;
    const used = [...pose.values()];
    const transforms = used.filter((s) => s.invert);
    const filters = used.filter((s) => !s.invert);
    const frame = (stop: Map<string, Step>) =>
      used.flatMap((s) =>
        s.values.map((_, i): [string, string] => [
          property(s, i),
          stop.get(s.name)?.values[i] ?? s.identity,
        ]),
      );
    const args = (s: Step) =>
      s.values.map((_, i) => `var(${property(s, i)}, ${s.identity})`);
    const cssText = (stop: Map<string, Step>) =>
      frame(stop)
        .map(([name, value]) => `${name}: ${value}`)
        .join("; ");
    const total = times[times.length - 1];

    // A camera's view can't take the class, so it shares the variables
    this.#rule = insertRule(
      hover ? `.${this.className}` : `.${this.className}, .c3r-view`,
      this,
    );
    this.#rules.push(this.#rule);
    const { style } = this.#rule;

    // Registered to interpolate, initially at rest so assigning doesn't transition
    const rest = new Map(frame(stops[0]));
    const register = (name: string, syntax: string) =>
      this.#rules.push(
        insertRule(
          `@property ${name}`,
          this,
          `{ syntax: "${syntax}"; inherits: false; initial-value: ${rest.get(name)}; }`,
        ),
      );
    for (const s of used)
      s.values.forEach((_, i) => register(property(s, i), s.syntax));

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
    const part: Style = { hover };
    if (transforms.length) {
      part.transform = transforms
        .map((s) => `${s.name}(${args(s).join()})`)
        .join(" ");
      part.inverse = transforms
        .toReversed()
        .map((s) => `${s.name}(${args(s).map(s.invert!).join()})`)
        .join(" ");
    }
    // Inherited as resolved text, a filter on the group would flatten it
    if (filters.length)
      part.filter = filters.map((s) => `${s.name}(${args(s)[0]})`).join(" ");
    if (transition) {
      style.setProperty(
        `${track}-transition`,
        [...rest.keys()]
          .map((name) => `${name} ${total}s ${timing}`)
          .join(", "),
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
