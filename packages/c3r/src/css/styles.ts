import css from "./styles.css?inline";

let sheet: CSSStyleSheet | undefined;

export function ensureStyles(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets.push(sheet);
  }
  return sheet;
}

export function deleteRule(rule: CSSStyleRule | null): void {
  if (!rule) return;
  registry.unregister(rule);
  const sheet = rule.parentStyleSheet;
  const i = sheet ? Array.from(sheet.cssRules).indexOf(rule) : -1;
  if (i >= 0) sheet!.deleteRule(i);
}

// For undisposed owners
const registry = new FinalizationRegistry(deleteRule);

// Lives until deleteRule() or owner GC
export function insertRule(selector: string, owner: object): CSSStyleRule {
  const sheet = ensureStyles();
  const i = sheet.insertRule(`${selector} {}`, sheet.cssRules.length);
  const rule = sheet.cssRules[i] as CSSStyleRule;
  registry.register(owner, rule, rule);
  return rule;
}

// Base styles, material and camera rules, for static html
export const cssText = (): string =>
  Array.from(ensureStyles().cssRules, (r) => r.cssText).join("\n");
