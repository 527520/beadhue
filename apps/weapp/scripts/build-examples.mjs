import { build } from "esbuild";
import sharp from "sharp";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(app, "../..");
const bundle = await build({
  stdin: {
    contents: `export {generatePattern} from './src/lib/engine/generate'; export {paletteColorsForSelection} from './src/lib/engine/kit'; export {DEFAULT_GENERATION_PARAMS} from './src/lib/types';`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  alias: { "@": `${root}/src` },
});
const {
  generatePattern,
  paletteColorsForSelection,
  DEFAULT_GENERATION_PARAMS,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const selection = { palette: { kind: "builtin", brand: "MARD" }, kitTier: 0 };
const patterns = {};
for (const id of ["rainbow", "strawberry", "frog", "cat"]) {
  const { data, info } = await sharp(
    await readFile(`${root}/public/examples/${id}.png`),
  )
    .resize({
      width: 800,
      height: 800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { pattern } = generatePattern(
    {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    },
    DEFAULT_GENERATION_PARAMS,
    paletteColorsForSelection(selection),
  );
  const colors = [],
    keys = new Map();
  const indices = pattern.cells.map((cell) => {
    const key = JSON.stringify(cell);
    if (!keys.has(key)) {
      keys.set(key, colors.length);
      colors.push(cell);
    }
    return keys.get(key);
  });
  patterns[id] = {
    width: pattern.width,
    height: pattern.height,
    colors,
    indices,
  };
}
await writeFile(
  `${app}/src/creation/example/patterns.json`,
  JSON.stringify(patterns),
);
