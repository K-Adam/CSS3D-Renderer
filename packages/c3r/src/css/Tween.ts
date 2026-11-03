import "../polyfill.js";

import { mat4 } from "gl-matrix";

import { type Filter, filterTexts, filterVariables } from "./Filter.js";
import { inverseStepValue, type Step, stepOf, stepText } from "./steps.js";
import { deleteRule, insertRule, plainValue } from "./styles.js";
import {
  joinTimeline,
  leaveTimeline,
  Timeline,
  touchTimeline,
} from "./Timeline.js";
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
  timeline?: Timeline;
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

interface Track {
  used: readonly Step[];
  stops: readonly Map<string, Step>[];
  times: readonly number[];
  easing: ((x: number) => number) | null;
  delay: number;
  loop: boolean;
  alternate: boolean;
  transition: boolean;
  // A loop each group plays while it is hovered itself
  ownHover: boolean;
  timing: string;
}
const tracks = new WeakMap<Tween, Track>();

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const at = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  return (x: number) => {
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 30; i++) {
      const t = (lo + hi) / 2;
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
    }
    return at((lo + hi) / 2, y1, y2);
  };
};
const KEYWORDS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};
// Null for an easing JS doesn't follow, which only matters once something samples it
const easingOf = (text: string): ((x: number) => number) | null => {
  const name = text.trim().toLowerCase();
  if (name === "linear") return (x) => x;
  if (KEYWORDS[name]) return bezier(...KEYWORDS[name]);
  const args = /^cubic-bezier\(([^)]*)\)$/
    .exec(name)?.[1]
    .split(",")
    .map(Number);
  return args?.length === 4 && args.every(Number.isFinite)
    ? bezier(args[0], args[1], args[2], args[3])
    : null;
};

const trackOf = (tween: Tween): Track => tracks.get(tween)!;

const loopOf = (tween: Tween): Track => {
  const track = trackOf(tween);
  if (!track.loop || track.delay > 0)
    throw new RangeError(
      "Only a tween that loops from the start can be sampled",
    );
  if (!track.easing)
    throw new RangeError("A tween with this easing can't be sampled");
  return track;
};

const poseAt = ({ used, stops }: Track, i: number, k: number): mat4 => {
  const out = mat4.create();
  for (const step of used) {
    if (step.kind !== "transform") continue;
    if (!step.matrix) throw new RangeError(`Can't sample ${step.name}`);
    const value = (stop: Map<string, Step>, j: number) =>
      parseFloat(stop.get(step.name)?.values[j] ?? step.identity);
    const values = step.values.map(
      (_, j) =>
        value(stops[i], j) + (value(stops[i + 1], j) - value(stops[i], j)) * k,
    );
    mat4.mul(out, out, step.matrix(values));
  }
  return out;
};

export const hoverTransitionOf = (tween: Tween) => {
  const track = trackOf(tween);
  if (!track.transition) return null;
  return {
    timing: track.timing,
    poseAt: (progress: number) => poseAt(track, 0, progress),
  };
};

export const playsOnOwnHover = (tween: Tween): boolean =>
  trackOf(tween).ownHover;

// Where each keyframe starts in a cycle, where a sampler must not cut
export const tweenKeyTimes = (tween: Tween): readonly number[] => {
  const { times, alternate, delay } = loopOf(tween);
  const cycle = tweenCycle(tween);
  return [...times, ...(alternate ? times.map((t) => cycle - t) : [])].map(
    (t) => (((t + delay) % cycle) + cycle) % cycle,
  );
};

export const tweenCycle = (tween: Tween): number => {
  const { times, alternate } = loopOf(tween);
  return times[times.length - 1] * (alternate ? 2 : 1);
};

export const tweenMatrixAt = (tween: Tween, t: number): mat4 => {
  const track = loopOf(tween);
  const { times, easing, delay, alternate } = track;
  const total = times[times.length - 1];
  let p = ((t - delay) / total) % (alternate ? 2 : 1);
  if (p > 1) p = 2 - p;
  const at = p * total;
  let i = 0;
  while (i < times.length - 2 && times[i + 1] <= at) i++;
  return poseAt(track, i, easing!((at - times[i]) / (times[i + 1] - times[i])));
};

const hoverRules = new WeakMap<Tween, [CSSStyleRule, string][]>();

// Another rule switched off while the hover transition is paused, deleted with it
export const addHoverRule = (
  tween: Tween,
  rule: CSSStyleRule,
  text: string,
): void => {
  const list = hoverRules.get(tween) ?? [];
  list.push([rule, text]);
  hoverRules.set(tween, list);
  rule.style.cssText = tween.paused ? "" : text;
};

// Loops and one-shot animations, a hover transition has none
const timelines = new WeakMap<Tween, Timeline>();

export const timelineOf = (tween: Tween): Timeline | null =>
  timelines.get(tween) ?? null;

// Keeps the tweens, and their rules, alive while their element is
const elementTweens = new WeakMap<Element, readonly Tween[]>();

// Returns the ones it replaced
export const setTweenClasses = (
  element: Element,
  tweens: readonly Tween[],
): readonly Tween[] => {
  const previous = elementTweens.get(element) ?? [];
  const classes = (list: readonly Tween[]) =>
    list.flatMap((t) => [t.className, timelineOf(t)?.className ?? []].flat());
  element.classList.remove(...classes(previous));
  element.classList.add(...classes(tweens));
  elementTweens.set(element, tweens);
  return previous;
};

export const hasFilter = (tween: Tween): boolean => {
  const part = styles.get(tween);
  return !!(part?.filter || part?.layers);
};

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
  touchTweens(tweens);
  return tweens;
}

// Their animations restart, so the next bake brings them in step
export const touchTweens = (tweens: Tween | readonly Tween[] | null): void => {
  for (const t of [tweens ?? []].flat()) {
    const timeline = timelineOf(t);
    if (timeline) touchTimeline(timeline);
  }
};

let nextId = 0;

export class Tween {
  readonly className = `c3r-tween-${nextId++}`;

  #paused = false;
  #rules: CSSRule[] = [];
  #rule: CSSStyleRule | null;
  #hoverRule: CSSStyleRule | null = null;
  #ownTimeline: Timeline | null = null;

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
    timeline,
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
    if (timeline && (transition || paused || hover))
      throw new RangeError(
        "A tween on a timeline takes its pause and hover from it, and can't move on hover",
      );

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
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ");
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
      this.#hoverRule = insertRule(`.${this.className}:hover`, this);
      addHoverRule(this, this.#hoverRule, cssText(stops[1]));
    } else {
      const own = timeline ?? (this.#ownTimeline = new Timeline({ paused }));
      timelines.set(this, own);
      // Shared ones start together. A private loop does too, but a group
      // hovered on its own keeps its own time and a one-shot plays from its start
      if (timeline || (loop && !hover)) joinTimeline(own, this.className);
      const count = loop ? "infinite" : 1;
      const direction = alternate ? "alternate" : "normal";
      style.setProperty(
        `${track}-animation`,
        `${this.className} ${total}s ${timing} ${count} ${direction} both var(${own.state}, running)`,
      );
      part.animation = `var(${track}-animation, none)`;
      if (hover) {
        // Each group plays while it is hovered itself, over the timeline's rule
        this.#hoverRule = insertRule(
          `.${this.className}:not(:hover)`,
          this,
          `{ ${own.state}: paused; }`,
        );
      }
    }
    if (this.#hoverRule) this.#rules.push(this.#hoverRule);
    styles.set(this, part);
    tracks.set(this, {
      used,
      stops,
      times,
      easing: easingOf(timingFunction),
      delay,
      loop,
      alternate,
      transition,
      ownHover: hover && loop,
      timing: `${total}s ${timing}`,
    });
    if (transition) this.paused = paused;
  }

  // Pauses everything on its timeline. CSS can't pause a transition, so a
  // hover transition is disabled instead
  get paused(): boolean {
    return timelines.get(this)?.paused ?? this.#paused;
  }

  set paused(paused: boolean) {
    const timeline = timelines.get(this);
    if (timeline) {
      timeline.paused = paused;
      return;
    }
    this.#paused = paused;
    for (const [rule, text] of hoverRules.get(this) ?? [])
      rule.style.cssText = paused ? "" : text;
  }

  [Symbol.dispose](): void {
    for (const rule of this.#rules) deleteRule(rule);
    for (const [rule] of hoverRules.get(this) ?? []) deleteRule(rule);
    this.#rules = [];
    const timeline = timelines.get(this);
    if (timeline) leaveTimeline(timeline, this.className);
    this.#ownTimeline?.[Symbol.dispose]();
    this.#rule = this.#hoverRule = null;
  }
}
