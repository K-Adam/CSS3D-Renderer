import type { Filter } from "../css/Filter.js";
import { stepOf } from "../css/steps.js";
import type { Transform } from "../css/Transform.js";
import { type Steps, Tween, type TweenOptions } from "../css/Tween.js";

import { Billboard } from "./Billboard.js";
import { Group, type IndexedMesh } from "./Group.js";

export interface ParticleSystemOptions {
  count: number;
  // Seconds
  lifetime: number;
  // Shortens each life by up to this fraction, so the particles drift apart
  lifetimeRandomness?: number;
  mesh: IndexedMesh;
  // Called once per particle, so its random values are fixed for it. Durations
  // are relative and fill the life
  tween: (particle: {
    random(min?: number, max?: number): number;
  }) => Pick<TweenOptions, "from" | "keyframes" | "easing">;
}

// A billboard counters its own rotations, so only translations go on it and
// the rest applies in the view plane, on its body
const moves = (step: Transform | Filter) =>
  stepOf(step)?.every((s) => s.moves) ?? false;

export class ParticleSystem extends Group {
  #tweens: Tween[] = [];

  constructor({
    count,
    lifetime,
    lifetimeRandomness = 0.1,
    mesh,
    tween,
  }: ParticleSystemOptions) {
    super();
    if (!(Number.isInteger(count) && count > 0))
      throw new RangeError(`Invalid count ${count}`);
    if (!(lifetime > 0 && Number.isFinite(lifetime)))
      throw new RangeError(`Invalid lifetime ${lifetime}`);
    if (!(lifetimeRandomness >= 0 && lifetimeRandomness < 1))
      throw new RangeError(`Invalid lifetimeRandomness ${lifetimeRandomness}`);

    const random = (min = 0, max = 1) => min + Math.random() * (max - min);
    for (let i = 0; i < count; i++) {
      const life = lifetime * (1 - lifetimeRandomness * random());
      // Negative, so the system starts full
      const delay = -random() * life;
      const { from = [], keyframes, easing } = tween({ random });
      const frames = keyframes.map((k) => {
        const { steps, duration: weight = 1 } = "steps" in k ? k : { steps: k };
        if (!(weight > 0 && Number.isFinite(weight)))
          throw new RangeError(`Invalid duration ${weight}`);
        return { steps, weight };
      });
      const total = frames.reduce((sum, k) => sum + k.weight, 0);
      const side = (keep: boolean) => {
        const pick = (steps: Steps) =>
          [steps].flat().filter((s) => moves(s) === keep);
        const start = pick(from);
        let own = frames.map((k) => ({
          steps: pick(k.steps),
          duration: (k.weight / total) * life,
        }));
        if (!own.some((k) => k.steps.length)) {
          if (!start.length) return null;
          // Holds what only the start sets
          own = [{ steps: start, duration: life }];
        }
        const made = new Tween({
          from: start,
          keyframes: own,
          easing,
          delay,
          loop: true,
        });
        this.#tweens.push(made);
        return made;
      };

      const billboard = new Billboard();
      // The material's flipbook plays once per life
      const { style } = billboard.domElement;
      style.setProperty("--c3r-flipbook-duration", `${life}s`);
      style.setProperty("--c3r-flipbook-delay", `${delay}s`);
      billboard.tween = side(true);
      const body = new Group();
      body.tween = side(false);
      body.addMesh(mesh);
      billboard.addChild(body);
      this.addChild(billboard);
    }
  }

  [Symbol.dispose](): void {
    for (const tween of this.#tweens) tween[Symbol.dispose]();
    this.#tweens = [];
  }
}
