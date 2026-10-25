import css from "./styles.css?inline";

export { css };

let sheet: CSSStyleSheet | undefined;

export function ensureStyles(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets.push(sheet);
  }
  return sheet;
}

// Base styles and material rules, for static html
export const cssText = (): string =>
  Array.from(ensureStyles().cssRules, (r) => r.cssText).join("\n");
