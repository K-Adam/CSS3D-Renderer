import { deleteRule, insertRule } from "./styles.js";

export interface TimelineOptions {
  paused?: boolean;
  // Plays only while a group in the container runs one of its tweens and is
  // hovered, or the container itself when it runs the light's
  hover?: boolean;
}

const members = new WeakMap<Timeline, Set<string>>();
const dirty = new Set<Timeline>();

let nextId = 0;

// Tweens that pause, hover and start as one
export class Timeline {
  readonly className = `c3r-timeline-${nextId++}`;

  #paused = false;
  #rules: CSSRule[] = [];
  // A camera's view can't take the class, so it shares the state
  #rule: CSSStyleRule | null = insertRule(
    `.${this.className}, .c3r-view`,
    this,
  );

  constructor({ paused = false, hover = false }: TimelineOptions = {}) {
    this.#rules.push(this.#rule!);
    members.set(this, new Set());
    if (hover) {
      const own = `.${this.className}`;
      const idle = `.c3r-container:not(:has(.c3r-group${own}:hover), ${own}:hover)`;
      this.#rules.push(
        insertRule(
          `${idle}${own}, ${idle} ${own}, ${idle} .c3r-view`,
          this,
          `{ ${this.state}: paused; }`,
        ),
      );
      // The view turns pointer events off, a group on it needs them to be hovered
      this.#rules.push(
        insertRule(`.c3r-group${own}`, this, "{ pointer-events: auto; }"),
      );
    }
    this.paused = paused;
  }

  get state(): string {
    return `--${this.className}-state`;
  }

  get paused(): boolean {
    return this.#paused;
  }

  set paused(paused: boolean) {
    this.#paused = paused;
    this.#rule?.style.setProperty(this.state, paused ? "paused" : "running");
  }

  [Symbol.dispose](): void {
    for (const rule of this.#rules) deleteRule(rule);
    this.#rules = [];
    this.#rule = null;
  }
}

export const joinTimeline = (timeline: Timeline, animation: string): void => {
  members.get(timeline)!.add(animation);
  dirty.add(timeline);
};

export const leaveTimeline = (timeline: Timeline, animation: string): void => {
  members.get(timeline)!.delete(animation);
};

// An object whose element runs animations on a timeline, without a tween
const followers = new WeakMap<object, Timeline>();
export const setFollowing = (owner: object, timeline?: Timeline): void => {
  if (timeline) followers.set(owner, timeline);
  else followers.delete(owner);
};
export const touchFollower = (owner: object): void => {
  const timeline = followers.get(owner);
  if (timeline) dirty.add(timeline);
};

export const touchTimeline = (timeline: Timeline): void => {
  dirty.add(timeline);
};

// The one running longest sets the time, so ones added later play in step
export function syncTimelines(): void {
  if (!dirty.size || typeof document.getAnimations !== "function") return;
  const animations = document.getAnimations();
  for (const timeline of dirty) {
    const names = members.get(timeline)!;
    const following = animations.filter((a) =>
      names.has((a as CSSAnimation).animationName),
    );
    const times = following.flatMap((a) =>
      typeof a.currentTime === "number" ? [a.currentTime] : [],
    );
    if (!times.length) continue;
    const time = Math.max(...times);
    for (const a of following) a.currentTime = time;
  }
  dirty.clear();
}
