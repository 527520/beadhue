#!/usr/bin/env python3
"""R15 终审走查的总览图：每个场景最多两张，供编排代理逐场景审。

- 桌面图 sheets/<场景>-desk.png：1440 / 1024 / 768 三列，上排原型、下排实现（统一缩到同一比例）。
- 手机图 sheets/<场景>-mob.png：390 / 350 两宽度，按「原型 | 实现」成对并排。
每张缩略图下方标出 report.json 的异常（报错、溢出、主按钮数、找不到的选择器）。

用法（仓库根目录）：python3 .scratch/ui-rebuild/tools/audit-sheet.py [场景名或前缀*…]
输入：evidence/audit/report.json 与 raw/*.png；输出：evidence/audit/sheets/。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module

compose = import_module('audit-compose')
font, flags = compose.font, compose.flags

ROOT = Path('.scratch/ui-rebuild/evidence/audit')
RAW = ROOT / 'raw'
OUT = ROOT / 'sheets'
DESK = [1440, 1024, 768]
MOB = [390, 350]
DESK_SCALE = 0.5
MOB_SCALE = 0.8
# 整页截图只取前面这么高（原尺寸像素），更长的部分看 pairs/ 里的原图。
MAX_SOURCE_HEIGHT = 2400
GAP = 16
MARGIN = 14
HEADER = 44
CAPTION = 34
BG = (244, 244, 245)
EMPTY = (228, 228, 231)
INK = (28, 28, 30)
MUTED = (110, 110, 118)
ALERT = (196, 43, 28)
TITLE, LABEL, SMALL = font(22), font(16), font(13)


def load(shot, scale):
    if not shot:
        return None
    path = ROOT / shot['file']
    if not path.exists():
        return None
    image = Image.open(path).convert('RGB')
    if image.height > MAX_SOURCE_HEIGHT:
        image = image.crop((0, 0, image.width, MAX_SOURCE_HEIGHT))
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)


def cell(draw, sheet, x, y, width, image, label, shot):
    draw.text((x, y), label, fill=MUTED, font=LABEL)
    top = y + 22
    if image is None:
        draw.rectangle((x, top, x + width, top + 120), fill=EMPTY)
        draw.text((x + 10, top + 50), '（无截图）', fill=MUTED, font=SMALL)
        return top + 120
    sheet.paste(image, (x, top))
    bottom = top + image.height
    notes = flags(shot)
    if notes:
        draw.text((x, bottom + 4), '；'.join(notes)[:90], fill=ALERT, font=SMALL)
    return bottom


def build(scene, shots, widths, scale, kind):
    available = [w for w in widths if shots.get((w, 'proto')) or shots.get((w, 'impl'))]
    if not available:
        return None
    images = {(w, side): load(shots.get((w, side)), scale) for w in available for side in ('proto', 'impl')}
    col_width = {w: max([img.width for side in ('proto', 'impl') if (img := images[(w, side)])] + [round(w * scale)]) for w in available}
    row_height = lambda side: max([images[(w, side)].height for w in available if images[(w, side)]] + [120])
    if kind == 'desk':
        width = MARGIN * 2 + sum(col_width.values()) + GAP * (len(available) - 1)
        height = HEADER + (22 + row_height('proto') + CAPTION) + (22 + row_height('impl') + CAPTION) + MARGIN
    else:
        width = MARGIN * 2 + sum(col_width[w] * 2 for w in available) + GAP * (len(available) * 2 - 1)
        height = HEADER + 22 + max(row_height('proto'), row_height('impl')) + CAPTION + MARGIN
    sheet = Image.new('RGB', (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    note = next((s.get('note') for s in shots.values() if s and s.get('note')), '') or ''
    draw.text((MARGIN, 10), f'{scene} · {"桌面" if kind == "desk" else "手机"}', fill=INK, font=TITLE)
    if note:
        draw.text((MARGIN + 360, 14), note[:70], fill=MUTED, font=SMALL)
    x = MARGIN
    if kind == 'desk':
        y_impl = HEADER + 22 + row_height('proto') + CAPTION
        for w in available:
            cell(draw, sheet, x, HEADER, col_width[w], images[(w, 'proto')], f'原型 {w}', shots.get((w, 'proto')))
            cell(draw, sheet, x, y_impl, col_width[w], images[(w, 'impl')], f'实现 {w}', shots.get((w, 'impl')))
            x += col_width[w] + GAP
    else:
        for w in available:
            for side, label in (('proto', '原型'), ('impl', '实现')):
                cell(draw, sheet, x, HEADER, col_width[w], images[(w, side)], f'{label} {w}', shots.get((w, side)))
                x += col_width[w] + GAP
    return sheet


def main():
    report = json.loads((ROOT / 'report.json').read_text(encoding='utf-8'))
    wanted = sys.argv[1:]

    def pick(name):
        if not wanted:
            return True
        return any(name == item or (item.endswith('*') and name.startswith(item[:-1])) for item in wanted)

    grouped = {}
    for shot in report['shots'].values() if isinstance(report['shots'], dict) else report['shots']:
        if not pick(shot['scene']):
            continue
        grouped.setdefault(shot['scene'], {})[(shot['width'], shot['side'])] = shot
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    for scene in sorted(grouped):
        for kind, widths, scale in (('desk', DESK, DESK_SCALE), ('mob', MOB, MOB_SCALE)):
            sheet = build(scene, grouped[scene], widths, scale, kind)
            if sheet is None:
                continue
            sheet.save(OUT / f'{scene}-{kind}.png', optimize=True)
            count += 1
    print(f'sheets: {count} → {OUT}')


if __name__ == '__main__':
    main()
