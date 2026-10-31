import type { Camera } from "../css/Camera.js";
import { cssVar, type CssValue, textOf } from "../css/CssValue.js";
import { deleteRule, insertRule, plainValue } from "../css/styles.js";

import { type Object3D, parents } from "./Object3D.js";

export interface AccumulatorOptions {
  // --name is the result, --name-input each node's input
  name: string;
  syntax: string;
  // The input of a node that sets none, and the value above the top
  identity: CssValue;
  combine: (parent: CssValue, input: CssValue) => CssValue;
  input?: (node: Object3D | Camera) => CssValue | null;
}

// Targets in each node's subtree, per accumulator
const counts = new WeakMap<Object3D, Map<Accumulator, number>>();
const properties = new Set<string>();
// Frees the names of an accumulator collected without disposing
const released = new FinalizationRegistry((names: string[]) => {
  for (const p of names) properties.delete(p);
  for (const camera of live(cameras))
    cameraStyles.get(camera)!.removeProperty(names[1]);
});

// Weak, so neither keeps the other alive
const inputs = new Set<WeakRef<Accumulator>>();
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

let shift: (acc: Accumulator, from: Object3D | undefined, n: number) => void;
let write: (
  acc: Accumulator,
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

let library = false;

export const libraryAccumulator = (
  options: AccumulatorOptions,
): Accumulator => {
  library = true;
  try {
    return new Accumulator(options);
  } finally {
    library = false;
  }
};

function validate({ name, syntax, identity }: AccumulatorOptions): string {
  if (!/^[a-z_][\w-]*$/i.test(name))
    throw new RangeError(
      `Invalid name ${name}, use letters, digits, _ or - without a leading --`,
    );
  if ([`--${name}`, `--${name}-input`].some((p) => properties.has(p)))
    throw new RangeError(`${name} is in use, dispose its Accumulator first`);
  if (name.startsWith("c3r-") && !library)
    throw new RangeError("The c3r- prefix is reserved");
  if (!/^[\w <>|+#*-]+$/.test(syntax))
    throw new RangeError(`Invalid syntax ${syntax}`);
  // An initial value can't depend on other properties, so no var() in it
  const initial = textOf(identity);
  if (!initial || !plainValue(initial))
    throw new RangeError(
      `Invalid identity "${initial}", it must print a value and read no other property`,
    );
  return initial;
}

let nextId = 0;

export class Accumulator {
  readonly className = `c3r-accumulator-${nextId++}`;

  readonly #result: string;
  readonly #syntax: string;
  readonly #inputProperty: string;
  readonly #input: AccumulatorOptions["input"];
  readonly #start: string;
  readonly #weakSelf = new WeakRef(this);
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

  constructor(options: AccumulatorOptions) {
    const initial = validate(options);
    const { name, syntax, identity, combine, input } = options;
    const result = `--${name}`;
    const inputProperty = `${result}-input`;
    const names = [result, inputProperty];
    const slot = (i: number) => `--${this.className}-${i}`;
    const flag = `--${this.className}-odd`;
    const fold = (parent: CssValue) =>
      textOf(combine(parent, cssVar(inputProperty, syntax)));
    const slotRef = (i: number) => cssVar(slot(i), syntax);
    const set = (i: number) =>
      `${slot(i)}: ${fold(slotRef(1 - i))}; ${result}: ${textOf(slotRef(i))};`;
    const seed = `${slot(0)}: ${fold(identity)}; ${slot(1)}: ${textOf(slotRef(0))};`;

    const register = (property: string, inherits: boolean) =>
      this.#addRule(
        `@property ${property}`,
        `{ syntax: "${syntax}"; inherits: ${inherits}; initial-value: ${initial}; }`,
      );
    const cls = `.${this.className}`;
    try {
      register(inputProperty, false);
      for (const property of [result, slot(0), slot(1)])
        register(property, true);
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
      this.#addRule(
        `:is(.c3r-group, .c3r-polygon):not(${cls}, .c3r-view)`,
        `{ ${result}: initial; ${slot(0)}: initial; ${slot(1)}: initial; }`,
      );
    } catch (error) {
      // A browser rejects a syntax or identity the allowlist lets through
      for (const rule of this.#rules) deleteRule(rule);
      throw error;
    }
    for (const p of names) properties.add(p);
    this.#result = result;
    this.#syntax = syntax;
    this.#inputProperty = inputProperty;
    this.#input = input;
    this.#start = `{ ${seed} ${result}: ${textOf(slotRef(0))}; }`;
    released.register(this, names, this);
    if (!input) return;
    inputs.add(this.#weakSelf);
    for (const camera of live(cameras))
      this.#write(camera, cameraStyles.get(camera)!);
  }

  get result(): CssValue {
    return cssVar(this.#result, this.#syntax);
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
    let value = "";
    try {
      const result = this.#input(node);
      value = result === null ? "" : textOf(result);
    } catch (error) {
      if (typeof reportError === "function") reportError(error);
      else console.error(error);
    }
    style.setProperty(this.#inputProperty, value);
  }

  #count(node: Object3D, n: number): void {
    if (!this.#rules.length) return;
    const map = counts.get(node) ?? new Map<Accumulator, number>();
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
      if (this.#input)
        node.domElement.style.removeProperty(this.#inputProperty);
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
    for (const p of [this.#result, this.#inputProperty]) properties.delete(p);
    inputs.delete(this.#weakSelf);
    if (this.#input)
      for (const camera of live(cameras))
        cameraStyles.get(camera)!.removeProperty(this.#inputProperty);
  }
}
