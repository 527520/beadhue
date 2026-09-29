import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(app, "../..");
await mkdir(`${app}/src/generated`, { recursive: true });
await mkdir(`${app}/src/assets`, { recursive: true });
// theme.css is the one source used by Web and native. Mobile overrides win.
const css = await readFile(`${root}/src/app/theme.css`, "utf8");
const tokens = new Map();
const mobileCss =
  css.split("@media (min-width: 768px)")[0] + "\n--spacing-control-md: 44px;";
for (const match of mobileCss.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
  if (!match[2].includes("initial")) tokens.set(match[1], match[2].trim());
}
await writeFile(
  `${app}/src/generated/tokens.css`,
  `/* Generated from Web theme.css; run prepare.mjs. */\npage {\n${[...tokens].map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`,
);
for (const name of ["rainbow", "strawberry", "frog", "cat"])
  await copyFile(
    `${root}/public/examples/${name}.png`,
    `${app}/src/assets/${name}.png`,
  );
// The same Lucide geometry as Web, emitted as static SVG, no React renderer.
const webRequire = createRequire(`${root}/package.json`);
const { createElement } = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");
const icons = webRequire("lucide-react");
for (const name of [
  "Compass",
  "Plus",
  "User",
  "Search",
  "ChevronLeft",
  "ChevronRight",
  "Settings",
  "Image",
  "FolderOpen",
  "Grid2X2",
  "Download",
  "Cloud",
  "Undo2",
  "Redo2",
  "Hand",
  "Pencil",
  "Eraser",
  "Pipette",
  "PaintBucket",
  "Check",
  "X",
  "SlidersHorizontal",
  "MoreHorizontal",
  "RotateCw",
  "FlipHorizontal",
  "CircleHelp",
]) {
  await writeFile(
    `${app}/src/assets/${name}.svg`,
    renderToStaticMarkup(
      createElement(icons[name], {
        size: 24,
        strokeWidth: 1.75,
        color: "#1C1C1E",
      }),
    ),
  );
}
// Outline the approved brand font so the wordmark never waits for font loading.
const fontkit = (await import("@pdf-lib/fontkit")).default;
const font = fontkit.create(
  new Uint8Array(await readFile(`${root}/assets/ui-fonts/ChillRoundF.ttf`)),
);
const run = font.layout("豆色绘");
const scale = 18 / font.unitsPerEm;
let advance = 34;
const glyphs = run.glyphs
  .map((glyph, i) => {
    const position = run.positions[i];
    const x = advance;
    advance += position.xAdvance * scale;
    return `<path d="${glyph.path.toSVG()}" transform="translate(${x + position.xOffset * scale},${20 - position.yOffset * scale}) scale(${scale},${-scale})" fill="#1C1C1E"/>`;
  })
  .join("");
const colors = ["#E0473F", "#FFD447", "#3F7FD9", "#47A35B"];
const beads = colors
  .map(
    (color, i) =>
      `<circle cx="${5.5 + (i % 2) * 13}" cy="${5.5 + Math.floor(i / 2) * 13}" r="5.5" fill="${color}"/><circle cx="${5.5 + (i % 2) * 13}" cy="${5.5 + Math.floor(i / 2) * 13}" r="2" fill="white" fill-opacity="0.72"/>`,
  )
  .join("");
await writeFile(
  `${app}/src/assets/brand.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(advance)}" height="24" viewBox="0 0 ${Math.ceil(advance)} 24">${beads}${glyphs}</svg>`,
);
