export type Kind = "transform" | "filter" | "layer";

export interface Step {
  name: string;
  // The CSS function, when the track name differs
  fn?: string;
  kind: Kind;
  syntax: string;
  identity: string;
  values: string[];
  // Transforms only, for the camera, null without an inverse
  invert?: ((value: string) => string) | null;
}

// Only factory-made steps, a forged one would inject raw CSS
type Steps = readonly Step[] | (() => readonly Step[]);
const steps = new WeakMap<object, Steps>();

// A function builds the steps once a tween asks, most transforms never tween
export function register<T extends object>(owner: T, list: Steps): T {
  steps.set(owner, list);
  return owner;
}

export function stepOf(value: unknown): readonly Step[] | undefined {
  const list = steps.get(value as object);
  if (typeof list !== "function") return list;
  const built = list();
  steps.set(value as object, built);
  return built;
}

// A transform list is a whole value, the second one is its inverse
export const stepText = (
  step: Step,
  args = step.values,
  inverse = false,
): string =>
  step.syntax === "<transform-list>"
    ? args[inverse ? 1 : 0]
    : `${step.fn ?? step.name}(${args.join()})`;

export const radians = (angle: number): string => {
  if (!Number.isFinite(angle)) throw new RangeError(`Invalid angle ${angle}`);
  return `${angle}rad`;
};
