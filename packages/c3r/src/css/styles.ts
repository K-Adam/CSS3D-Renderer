import css from "./styles.css?inline";

export { css };

let sheet: CSSStyleSheet | undefined;

// No constructable stylesheets server-side, inline `css` there
export function ensureStyles(): void {
  if (sheet || typeof CSSStyleSheet === "undefined") return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets.push(sheet);
}
