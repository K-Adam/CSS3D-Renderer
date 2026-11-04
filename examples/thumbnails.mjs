// Screenshots each built example and adds link preview tags, after `npm run build`:
// node examples/thumbnails.mjs https://k-adam.github.io/CSS3D-Renderer
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

// Absolute, as crawlers don't resolve relative URLs. The slash keeps the last path segment
const site = new URL(process.argv[2].replace(/\/?$/, "/"));
const DIST = resolve(import.meta.dirname, "dist");
// 1.91:1, the ratio every major platform crops previews to
const [WIDTH, HEIGHT] = [1200, 630];
const DESCRIPTION =
  "Textured 3D scenes from plain DOM elements and CSS transforms.";

const read = (page) => readFileSync(join(DIST, page), "utf8");
const pages = [...read("index.html").matchAll(/href="([^":]+\.html)"/g)].map(
  (m) => m[1],
);
const imageOf = (page) =>
  `thumbnails/${page.replaceAll("/", "-")}`.replace(/\.html$/, ".jpg");

const server = await preview({
  configFile: false,
  root: import.meta.dirname,
  logLevel: "error",
});
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });
  for (const page of pages) {
    await tab.goto(new URL(page, server.resolvedUrls.local[0]).href, {
      waitUntil: "networkidle",
    });
    // Lets entry animations and tweens move away from their first frame
    await tab.waitForTimeout(1000);
    // Under 300 KB, which WhatsApp needs
    await tab.screenshot({
      path: join(DIST, imageOf(page)),
      type: "jpeg",
      quality: 80,
    });
  }
} finally {
  await browser.close();
  await server.close();
}

const tag = (attr, key, value) =>
  `<meta ${attr}="${key}" content="${value.replace(/"/g, "&quot;")}">`;
// A screenshot of the link list would show nothing 3D
for (const [page, image] of [
  ...pages.map((p) => [p, imageOf(p)]),
  ["index.html", imageOf("demos/moon/index.html")],
]) {
  const html = read(page);
  const title = /<title>([^<]*)<\/title>/.exec(html)[1].trim();
  const tags = [
    tag("property", "og:type", "website"),
    tag("property", "og:site_name", "CSS 3D Renderer"),
    tag("property", "og:title", title),
    tag("property", "og:description", DESCRIPTION),
    tag(
      "property",
      "og:url",
      new URL(page.replace(/index\.html$/, ""), site).href,
    ),
    tag("property", "og:image", new URL(image, site).href),
    tag("property", "og:image:width", `${WIDTH}`),
    tag("property", "og:image:height", `${HEIGHT}`),
    tag("property", "og:image:alt", `Screenshot of ${title}`),
    tag("name", "twitter:card", "summary_large_image"),
  ];
  writeFileSync(
    join(DIST, page),
    html.replace("</head>", `${tags.join("\n")}\n</head>`),
  );
}
