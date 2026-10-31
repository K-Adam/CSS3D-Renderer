import "../polyfill.js";

import { type Filter, filterTexts, filterVariables } from "./Filter.js";
import { inverseStepValue, type Step, stepOf, stepText } from "./steps.js";
import { deleteRule, insertRule, plainValue } from "./styles.js";
import type { Transform } from "./Transform.js";

export type Steps = Transform | Filter | readonly (Transform | Filter)[];
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
  layers?: string;
  animation?: string;
  transition?: string;
  hover?: boolean;
}

const styles = new WeakMap<Tween, Style>();

type AnimatedStep = { step: Step; args: string[] };
const animatedSteps = new WeakMap<Tween, AnimatedStep[]>();

// Transform steps with their animated arguments, so others can build on them
export const transformSteps = (tween: Tween): readonly AnimatedStep[] =>
  animatedSteps.get(tween) ?? [];

// Throws before writing anything
export function setTweens(
  style: CSSStyleDeclaration | undefined,
  tween: Tween | readonly Tween[] | null,
  inverse = false,
  // An inline animation replaces any other, so the group's clock joins the list
  extra = "",
): readonly Tween[] {
  const tweens = Object.freeze([...new Set([tween ?? []].flat())]);
  const parts = tweens.map((tween) => {
    const part = styles.get(tween);
    if (!part) throw new TypeError("Not a Tween");
    if (inverse && part.hover) throw new RangeError("A camera can't hover");
    if (inverse && part.transform && !part.inverse)
      throw new RangeError("A camera can't tween a zero or negative scale");
    return part;
  });
  const list = (key: keyof Style, separator: string, from = parts) =>
    from.flatMap((part) => part[key] ?? []).join(separator);
  const properties = {
    "--c3r-tween-transform": inverse
      ? list("inverse", " ", parts.toReversed())
      : list("transform", " "),
    animation: [list("animation", ", "), extra].filter(Boolean).join(", "),
    transition: list("transition", ", "),
    ...filterVariables(
      "--c3r-tween-",
      list("filter", " "),
      list("layers", " "),
    ),
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
    let invertible = true;
    const apply = (changes: Steps, where: string) => {
      const names = new Set<string>();
      for (const change of [changes].flat()) {
        const list = stepOf(change);
        if (!list) throw new TypeError("Not a Transform or Filter");
        if (!list.length)
          throw new RangeError(
            "A tween can't decompose a matrix with shear, perspective or a zero scale",
          );
        for (const step of list) {
          // A from value becomes an initial-value, which can't read var(), and
          // Firefox steps a var() keyframe
          if (!step.values.every((v) => plainValue(v)))
            throw new RangeError("A tween can't animate a var()");
          if (names.has(step.name))
            throw new RangeError(`${step.name} twice in ${where}`);
          names.add(step.name);
          pose.set(step.name, step);
          invertible &&= step.invert !== null;
        }
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
    let several = false;
    for (const c of timingFunction) {
      depth += c === "(" ? 1 : c === ")" ? -1 : 0;
      if (c === "," && !depth) several = true;
    }
    if (
      several ||
      !timingFunction.trim() ||
      !plainValue(timingFunction) ||
      /^\s*(inherit|initial|unset|revert(-layer)?)\s*$/i.test(timingFunction)
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
    const transforms = used.filter((s) => s.kind === "transform");
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
    const steps = transforms.map((step) => ({ step, args: args(step) }));
    animatedSteps.set(this, steps);
    // Fallbacks keep the element's other tweens when this one is disposed
    const part: Style = { hover };
    if (steps.length) {
      part.transform = steps
        .map(({ step, args }) => stepText(step, args))
        .join(" ");
      if (invertible)
        part.inverse = steps
          .toReversed()
          .map(({ step, args }) => String(inverseStepValue(step, args)))
          .join(" ");
    }
    // Inherited as resolved text, a filter on the group would flatten it
    const { filter, layers } = filterTexts(used, args);
    if (filter) part.filter = filter;
    if (layers) part.layers = layers;
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
