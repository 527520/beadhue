// 从 lucide-static 抽取原型用到的图标，生成 prototype/icons.svg 雪碧图。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.scratch/ui-rebuild/prototype');
const SOURCE = resolve(ROOT, 'vendor/package/icons');
const NAMES = `compass plus user search x chevron-down chevron-up chevron-left chevron-right arrow-left arrow-right arrow-up-right
ellipsis ellipsis-vertical menu bell settings log-out circle-help info lock cloud cloud-off cloud-check check circle-check
triangle-alert circle-alert heart share-2 flag bookmark download upload image image-plus file file-down file-up folder folder-open
grid-3x3 layout-grid list sliders-horizontal arrow-up-down eye trash-2 copy pencil link send sparkles star clock refresh-cw
maximize-2 minimize-2 zoom-in zoom-out scan hand paintbrush eraser paint-bucket pipette replace undo-2 redo-2 rotate-cw
flip-horizontal-2 crop palette layers grid-2x2 hash message-circle shopping-cart list-checks shield-check users tag tags inbox
chart-column activity scroll-text server layout-dashboard funnel calendar external-link move printer loader-circle badge-check
user-plus house wand-sparkles square-dashed panel-right panel-left grip-vertical keyboard sun moon command at-sign history
circle-dot circle map-pin trending-up ban lock-keyhole unlock eye-off message-square-warning messages-square panels-top-left
flip-vertical-2 minus locate-fixed cloud-alert database mail trending-down`.split(/\s+/).filter(Boolean);

const symbols = [];
const missing = [];
for (const name of NAMES) {
  const file = resolve(SOURCE, `${name}.svg`);
  if (!existsSync(file)) { missing.push(name); continue; }
  const svg = readFileSync(file, 'utf8');
  const inner = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`);
}
writeFileSync(resolve(ROOT, 'icons.svg'), `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>\n`);
console.log(`icons: ${symbols.length}, missing: ${missing.join(', ') || 'none'}`);
