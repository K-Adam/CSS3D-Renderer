import css from "./styles.css?inline";

let sheet: CSSStyleSheet | undefined;

export function ensureStyles(): void {
  if (sheet) return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets.push(sheet);
}
