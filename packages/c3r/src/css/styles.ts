import css from "./styles.css?inline";

let sheet: CSSStyleSheet | undefined;
let baseRules = 0;

// Firefox stops an out of view animation unless it changes layout, which a
// custom property never does. A min-width under its 1/60px unit counts but
// moves nothing, and as text it survives server-side output
// https://bugzilla.mozilla.org/show_bug.cgi?id=1487412
// https://bugzilla.mozilla.org/show_bug.cgi?id=1992412
// https://bugzilla.mozilla.org/show_bug.cgi?id=2087794
const firefoxCopy = (keyframes: string): string =>
  `@supports (-moz-appearance: none) { ${keyframes.replace(/}\s*$/, "0% { min-width: 0px } 100% { min-width: 0.001px } }")} }`;
const copies = new WeakMap<CSSRule, CSSRule>();

export function ensureStyles(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    baseRules = sheet.cssRules.length;
    for (const { cssText } of Array.from(sheet.cssRules))
      if (cssText.startsWith("@keyframes"))
        sheet.insertRule(firefoxCopy(cssText), sheet.cssRules.length);
    document.adoptedStyleSheets.push(sheet);
  }
  return sheet;
}

// A server-side DOM rejects @property, cssText() still emits it
const rejected = new Set<CSSRule>();

export function deleteRule(rule: CSSRule | null): void {
  if (!rule) return;
  deleteRule(copies.get(rule) ?? null);
  registry.unregister(rule);
  rejected.delete(rule);
  const sheet = rule.parentStyleSheet;
  const i = sheet ? Array.from(sheet.cssRules).indexOf(rule) : -1;
  if (i >= 0) sheet!.deleteRule(i);
}

// For undisposed owners
const registry = new FinalizationRegistry(deleteRule);

// Lives until deleteRule() or owner GC
export function insertRule(
  selector: string,
  owner: object,
  block = "{}",
): CSSStyleRule {
  const sheet = ensureStyles();
  const text = `${selector} ${block}`;
  let rule: CSSRule;
  try {
    rule = sheet.cssRules[sheet.insertRule(text, sheet.cssRules.length)];
  } catch (error) {
    // A server-side DOM rejects every @property, a browser only an invalid one
    if (!selector.startsWith("@property") || "CSSPropertyRule" in globalThis)
      throw error;
    rule = { cssText: text } as CSSRule;
    rejected.add(rule);
  }
  registry.register(owner, rule, rule);
  if (selector.startsWith("@keyframes"))
    copies.set(rule, insertRule(firefoxCopy(text), owner, ""));
  return rule as CSSStyleRule;
}

// Nothing that ends the rule, comments out the rest or loads a resource, and
// reads other properties only when allowed
export function plainValue(text: string, vars = false): boolean {
  let depth = 0;
  for (const c of text) {
    depth += c === "(" ? 1 : c === ")" ? -1 : 0;
    if (depth < 0) return false;
  }
  return (
    !depth &&
    (vars || !/\bvar\(/i.test(text)) &&
    !/\/\*|\b(env|attr|url)\(|[^\w\s().,%+\-*/#]/i.test(text)
  );
}

// Base styles as source text, a server-side DOM drops @property
export const cssText = (): string =>
  [
    css,
    ...Array.from(ensureStyles().cssRules)
      .slice(baseRules)
      .map((r) => r.cssText),
    ...Array.from(rejected, (r) => r.cssText),
  ].join("\n");

// So no value can close the style element
export const styleHTML = (): string =>
  `<style>${cssText().replaceAll("<", "\\3c ")}</style>`;
