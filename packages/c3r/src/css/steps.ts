import { type CssFunction, CssValue, cssRaw } from "./CssValue.js";

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
  // Set by the factories of steps that only turn, so others can undo them
  rotates?: boolean;
  // Set by the factories of steps that only move
  moves?: boolean;
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
export const stepValue = (
  step: Step,
  args: string[],
  inverse = false,
): CssValue =>
  step.syntax === "<transform-list>"
    ? cssRaw(args[inverse ? 1 : 0], "<transform-list>")
    : CssValue.fn(
        (step.fn ?? step.name) as CssFunction,
        ...args.map((arg) => cssRaw(arg)),
      );

// Steps invert their values, and a transform list picks its stored inverse
export const inverseStepValue = (step: Step, args: string[]): CssValue =>
  stepValue(step, args.map(step.invert!), true);

export const stepText = (...args: Parameters<typeof stepValue>): string =>
  String(stepValue(...args));

export const radians = (angle: number): string => String(CssValue.rad(angle));
