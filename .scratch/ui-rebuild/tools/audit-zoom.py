#!/usr/bin/env python3
"""R15 终审走查的局部放大：同场景同宽度的原型与实现裁同一区域，按原尺寸上下叠放。

用法（仓库根目录）：python3 .scratch/ui-rebuild/tools/audit-zoom.py <场景> <宽度> <y0> <y1> [x0 x1] [--out=路径]
输出默认 /tmp/r15-zoom-<场景>-<宽度>-<y0>-<y1>.png。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module

font = import_module('audit-compose').font
RAW = Path('.scratch/ui-rebuild/evidence/audit/raw')
LABEL = font(16)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_arg = next((a[6:] for a in sys.argv[1:] if a.startswith('--out=')), None)
    scene, width, y0, y1 = args[0], int(args[1]), int(args[2]), int(args[3])
    x0, x1 = (int(args[4]), int(args[5])) if len(args) >= 6 else (0, width)
    parts = []
    for side, label in (('proto', '原型'), ('impl', '实现')):
        path = RAW / f'{scene}-{width}-{side}.png'
        if not path.exists():
            continue
        image = Image.open(path).convert('RGB')
        crop = image.crop((x0, y0, min(x1, image.width), min(y1, image.height)))
        parts.append((label, crop))
    if not parts:
        sys.exit(f'没有截图：{scene}-{width}')
    total_w = max(crop.width for _, crop in parts)
    total_h = sum(crop.height + 26 for _, crop in parts) + 8
    sheet = Image.new('RGB', (total_w, total_h), (244, 244, 245))
    draw = ImageDraw.Draw(sheet)
    y = 4
    for label, crop in parts:
        draw.text((6, y), f'{label} {scene} {width} [{x0},{y0}]–[{x1},{y1}]', fill=(110, 110, 118), font=LABEL)
        sheet.paste(crop, (0, y + 22))
        y += crop.height + 26
    out = Path(out_arg or f'/tmp/r15-zoom-{scene}-{width}-{y0}-{y1}.png')
    sheet.save(out)
    print(out)


if __name__ == '__main__':
    main()
