import type { Camera } from "../css/Camera.js";
import type { Composite, CssVector } from "../css/CssMatrix.js";
import { cssVar, CssValue, textOf } from "../css/CssValue.js";
import { deleteRule, insertRule, plainValue } from "../css/styles.js";

import { type Object3D, parents } from "./Object3D.js";

export interface AccumulatorOptions<
  T extends CssValue | CssVector = CssValue,
  I extends CssValue | Composite = T,
> {
  // --name is the result, --name-input each node's input, and --name-k and
  // --name-k-input for each component of a composite
  name: string;
  syntax: string;
  // The value off the chain, and by default above the top and of a node's input
  identity: T;
  // The value above the top, unlike the identity it may read var()
  start?: T;
  // For an input of another shape
  inputIdentity?: I;
  combine: (parent: T, input: I) => T;
  input?: (node: Object3D | Camera) => I | null;
}

type AnyAccumulator = Accumulator<any, any>;

const componentsOf = (value: CssValue | Composite): readonly CssValue[] =>
  value instanceof CssValue ? [value] : value.components;

const textsOf = (count: number, value: CssValue | Composite): string[] => {
  const components = componentsOf(value);
  if (components.length !== count)
    throw new TypeError("A value must have the shape of the identity");
  return components.map(textOf);
};

const propertiesOf = (
  name: string,
  value: CssValue | Composite,
  suffix = "",
): string[] =>
  componentsOf(value).map((_, k) =>
    value instanceof CssValue
      ? `--${name}${suffix}`
      : `--${name}-${k}${suffix}`,
  );

// Targets in each node's subtree, per accumulator
const counts = new WeakMap<Object3D, Map<AnyAccumulator, number>>();
const properties = new Set<string>();
// Frees the names of an accumulator collected without disposing
const released = new FinalizationRegistry((names: string[]) => {
  for (const p of names) properties.delete(p);
  for (const camera of live(cameras))
    for (const p of names) cameraStyles.get(camera)!.removeProperty(p);
});

// Weak, so neither keeps the other alive
const inputs = new Set<WeakRef<AnyAccumulator>>();
const cameras = new Set<WeakRef<Camera>>();
const cameraStyles = new WeakMap<Camera, CSSStyleDeclaration>();

const live = <T extends object>(refs: Set<WeakRef<T>>): T[] => {
  const alive: T[] = [];
  for (const ref of refs) {
    const value = ref.deref();
    if (value) alive.push(value);
    else refs.delete(ref);
  }
  return alive;
};

let shift: (acc: AnyAccumulator, from: Object3D | undefined, n: number) => void;
let write: (
  acc: AnyAccumulator,
  node: Object3D | Camera,
  style: CSSStyleDeclaration,
) => void;

export const moveTargets = (obj: Object3D, sign: 1 | -1): void => {
  for (const [acc, n] of counts.get(obj) ?? [])
    shift(acc, parents.get(obj), sign * n);
};

export const refreshInput = (node: Object3D): void => {
  for (const acc of counts.get(node)?.keys() ?? [])
    write(acc, node, node.domElement.style);
};

export const refreshCamera = (
  camera: Camera,
  style: CSSStyleDeclaration,
): void => {
  if (!cameraStyles.has(camera)) cameras.add(new WeakRef(camera));
  cameraStyles.set(camera, style);
  for (const acc of live(inputs)) write(acc, camera, style);
};

// Firefox throws on writing to a deleted rule's style
export const forgetCamera = (camera: Camera): void => {
  cameraStyles.delete(camera);
  for (const ref of cameras) if (ref.deref() === camera) cameras.delete(ref);
};

let library = false;

export const libraryAccumulator = <
  T extends CssValue | CssVector,
  I extends CssValue | Composite = T,
>(
  options: AccumulatorOptions<T, I>,
): Accumulator<T, I> => {
  library = true;
  try {
    return new Accumulator(options);
  } finally {
    library = false;
  }
};

function validate(
  name: string,
  syntax: string,
  identity: CssValue | CssVector,
  inputIdentity: CssValue | Composite,
): void {
  if (!/^[a-z_][\w-]*$/i.test(name))
    throw new RangeError(
      `Invalid name ${name}, use letters, digits, _ or - without a leading --`,
    );
  const names = [
    ...propertiesOf(name, identity),
    ...propertiesOf(name, inputIdentity, "-input"),
  ];
  if (names.some((p) => properties.has(p)))
    throw new RangeError(`${name} is in use, dispose its Accumulator first`);
  if (name.startsWith("c3r-") && !library)
    throw new RangeError("The c3r- prefix is reserved");
  if (!/^[\w <>|+#*-]+$/.test(syntax))
    throw new RangeError(`Invalid syntax ${syntax}`);
  // An initial value can't depend on other properties, so no var() in it
  for (const initial of [identity, inputIdentity].flatMap(componentsOf))
    if (!textOf(initial) || !plainValue(textOf(initial)))
      throw new RangeError(
        `Invalid identity "${initial}", it must print a value and read no other property`,
      );
}

let nextId = 0;

export class Accumulator<
  T extends CssValue | CssVector = CssValue,
  I extends CssValue | Composite = T,
> {
  readonly className = `c3r-accumulator-${nextId++}`;

  readonly result: T;

  readonly #names: readonly string[];
  readonly #inputProperties: readonly string[];
  readonly #input: AccumulatorOptions<T, I>["input"];
  readonly #start: string;
  readonly #weakSelf: WeakRef<AnyAccumulator> = new WeakRef(this);
  #rules: CSSRule[] = [];
  readonly #targets = new WeakSet<Object3D>();
  // Weak, so dispose can clean the chain without keeping its nodes alive
  readonly #chain = new Set<WeakRef<Object3D>>();
  readonly #chainRefs = new WeakMap<Object3D, WeakRef<Object3D>>();
  // Collected nodes leave dead refs, swept whenever the set doubles
  #pruneAt = 64;

  static {
    shift = (acc, from, n) => {
      for (let node = from; node; node = parents.get(node)) acc.#count(node, n);
    };
    write = (acc, node, style) => acc.#write(node, style);
  }

  constructor(options: AccumulatorOptions<T, I>) {
    const { name, syntax, identity, start = identity } = options;
    const { combine, input } = options;
    const inputIdentity: CssValue | Composite =
      options.inputIdentity ?? identity;
    validate(name, syntax, identity, inputIdentity);
    const resultProperties = propertiesOf(name, identity);
    const inputProperties = propertiesOf(name, inputIdentity, "-input");
    const names = [...resultProperties, ...inputProperties];
    const initials = componentsOf(identity).map(textOf);
    const slot = (i: number, k: number) => `--${this.className}-${i}-${k}`;
    const flag = `--${this.className}-odd`;
    const refs = <V>(like: CssValue | Composite, list: readonly string[]) => {
      const values = list.map((p) => cssVar(p, syntax));
      return (
        like instanceof CssValue ? values[0] : like.withComponents(values)
      ) as V;
    };
    const inputRefs = refs<I>(inputIdentity, inputProperties);
    const fold = (parent: T) =>
      textsOf(resultProperties.length, combine(parent, inputRefs));
    const set = (i: number) =>
      fold(
        refs<T>(
          identity,
          resultProperties.map((_, k) => slot(1 - i, k)),
        ),
      )
        .map(
          (text, k) =>
            `${slot(i, k)}: ${text}; ${resultProperties[k]}: var(${slot(i, k)});`,
        )
        .join(" ");
    // A combine may drop what a long start adds
    textsOf(resultProperties.length, start);
    const seed = fold(start)
      .map(
        (text, k) =>
          `${slot(0, k)}: ${text}; ${slot(1, k)}: var(${slot(0, k)});`,
      )
      .join(" ");

    const register = (property: string, inherits: boolean, initial: string) =>
      this.#addRule(
        `@property ${property}`,
        `{ syntax: "${syntax}"; inherits: ${inherits}; initial-value: ${initial}; }`,
      );
    const cls = `.${this.className}`;
    try {
      resultProperties.forEach((result, k) => {
        for (const property of [result, slot(0, k), slot(1, k)])
          register(property, true, initials[k]);
      });
      componentsOf(inputIdentity).forEach((initial, k) =>
        register(inputProperties[k], false, textOf(initial)),
      );
      // Emulates `--name: combine(inherit(--name), var(--name-input))` until
      // Firefox ships inherit() and Chrome enables it, then the parent ref
      // turns into it: a node reads its parent's slot and writes the other,
      // the flag alternating them down the chain
      this.#addRule(
        `@container not style(${flag}: 1)`,
        `{ ${cls} { ${flag}: 1; ${set(0)} } }`,
      );
      this.#addRule(
        `@container style(${flag}: 1)`,
        `{ ${cls} { ${flag}: 0; ${set(1)} } }`,
      );
      this.#addRule(`.c3r-view:has(> ${cls})`, `{ ${seed} }`);
      // Off the chain, a changing value restyles no deeper than one level
      const reset = resultProperties
        .flatMap((p, k) => [p, slot(0, k), slot(1, k)])
        .map((p) => `${p}: initial;`)
        .join(" ");
      this.#addRule(
        `:is(.c3r-group, .c3r-polygon):not(${cls}, .c3r-view)`,
        `{ ${reset} }`,
      );
    } catch (error) {
      // A browser rejects a syntax or identity the allowlist lets through
      for (const rule of this.#rules) deleteRule(rule);
      throw error;
    }
    for (const p of names) properties.add(p);
    this.result = refs<T>(identity, resultProperties);
    this.#names = names;
    this.#inputProperties = inputProperties;
    this.#input = input;
    const starts = resultProperties
      .map((p, k) => `${p}: var(${slot(0, k)});`)
      .join(" ");
    this.#start = `{ ${seed} ${starts} }`;
    released.register(this, names, this);
    if (!input) return;
    inputs.add(this.#weakSelf);
    for (const camera of live(cameras))
      this.#write(camera, cameraStyles.get(camera)!);
  }

  addTarget(obj: Object3D): void {
    if (this.#targets.has(obj)) return;
    this.#targets.add(obj);
    shift(this, obj, 1);
  }

  removeTarget(obj: Object3D): void {
    if (this.#targets.delete(obj)) shift(this, obj, -1);
  }

  restartUnder(selector: string): void {
    if (!this.#rules.length) return;
    const invalid = new RangeError(`Invalid selector ${selector}`);
    if (/[{};@<]|\/\*/.test(selector)) throw invalid;
    try {
      document.createDocumentFragment().querySelector(selector);
      // An unclosed ( or string passes alone but breaks the wrapped rule
      this.#addRule(`:is(${selector}) > .${this.className}`, this.#start);
    } catch {
      throw invalid;
    }
  }

  #addRule(selector: string, block: string): void {
    this.#rules.push(insertRule(selector, this, block));
  }

  // A failing rule leaves the identity, so the tree stays consistent
  #write(node: Object3D | Camera, style: CSSStyleDeclaration): void {
    if (!this.#input || !this.#rules.length) return;
    let texts: string[] = [];
    try {
      const result = this.#input(node);
      if (result !== null)
        texts = textsOf(this.#inputProperties.length, result);
    } catch (error) {
      if (typeof reportError === "function") reportError(error);
      else console.error(error);
    }
    this.#inputProperties.forEach((p, k) =>
      style.setProperty(p, texts[k] ?? ""),
    );
  }

  #clearInput(style: CSSStyleDeclaration): void {
    for (const p of this.#inputProperties) style.removeProperty(p);
  }

  #count(node: Object3D, n: number): void {
    if (!this.#rules.length) return;
    const map = counts.get(node) ?? new Map<AnyAccumulator, number>();
    const old = map.get(this) ?? 0;
    const now = old + n;
    if (now) map.set(this, now);
    else map.delete(this);
    if (map.size) counts.set(node, map);
    else counts.delete(node);
    if (old > 0 === now > 0) return;
    node.domElement.classList.toggle(this.className, now > 0);
    if (now > 0) {
      const ref = new WeakRef(node);
      this.#chainRefs.set(node, ref);
      this.#chain.add(ref);
      if (this.#chain.size >= this.#pruneAt)
        this.#pruneAt = 2 * live(this.#chain).length + 64;
      this.#write(node, node.domElement.style);
    } else {
      this.#chain.delete(this.#chainRefs.get(node)!);
      this.#chainRefs.delete(node);
      if (this.#input) this.#clearInput(node.domElement.style);
    }
  }

  [Symbol.dispose](): void {
    if (!this.#rules.length) return;
    // A later accumulator may take the name, so the chain leaves first
    for (const node of live(this.#chain))
      this.#count(node, -counts.get(node)!.get(this)!);
    for (const rule of this.#rules) deleteRule(rule);
    this.#rules = [];
    released.unregister(this);
    for (const p of this.#names) properties.delete(p);
    inputs.delete(this.#weakSelf);
    if (this.#input)
      for (const camera of live(cameras))
        this.#clearInput(cameraStyles.get(camera)!);
  }
}
