import css from "./styles.css?inline";

let sheet: CSSStyleSheet | undefined;
let baseRules = 0;

export function ensureStyles(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    baseRules = sheet.cssRules.length;
    document.adoptedStyleSheets.push(sheet);
  }
  return sheet;
}

// A server-side DOM rejects @property, cssText() still emits it
const rejected = new Set<CSSRule>();

export function deleteRule(rule: CSSRule | null): void {
  if (!rule) return;
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
    if (!selector.startsWith("@property")) throw error;
    rule = { cssText: text } as CSSRule;
    rejected.add(rule);
  }
  registry.register(owner, rule, rule);
  return rule as CSSStyleRule;
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
