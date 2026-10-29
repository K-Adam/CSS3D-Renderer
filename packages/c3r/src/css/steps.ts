export type Kind = "transform" | "filter" | "layer";

export interface Step {
  name: string;
  kind: Kind;
  syntax: string;
  identity: string;
  values: string[];
  // Transforms only, for the camera, null without an inverse
  invert?: ((value: string) => string) | null;
}

// Only factory-made steps, a forged one would inject raw CSS
const steps = new WeakMap<object, Step>();

export function register<T extends object>(owner: T, step: Step): T {
  steps.set(owner, step);
  return owner;
}

export const stepOf = (value: unknown): Step | undefined =>
  steps.get(value as object);

export const stepText = (step: Step, args = step.values): string =>
  `${step.name}(${args.join()})`;

export const radians = (angle: number): string => {
  if (!Number.isFinite(angle)) throw new RangeError(`Invalid angle ${angle}`);
  return `${angle}rad`;
};
