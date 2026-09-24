"""终审细看：把同一场景、同一宽度的原型与实现原图按同一区域 1:1 裁下来并排。

用法：python3 audit-crop.py <场景> <宽度> <x> <y> <宽> <高> [输出名]
区域是 CSS 像素（截图为 deviceScaleFactor 1）。输出到 evidence/audit/crops/。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'evidence', 'audit')
scene, width = sys.argv[1], sys.argv[2]
x, y, w, h = (int(value) for value in sys.argv[3:7])
name = sys.argv[7] if len(sys.argv) > 7 else f'{scene}-{width}-{x}-{y}'

tiles = []
for side in ('proto', 'impl'):
    path = os.path.join(ROOT, 'raw', f'{scene}-{width}-{side}.png')
    if os.path.exists(path):
        tiles.append((side, Image.open(path).convert('RGB').crop((x, y, x + w, y + h))))

try:
    font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 16)
except OSError:
    font = ImageFont.load_default()
gap, label = 16, 26
canvas = Image.new('RGB', (sum(tile.width for _, tile in tiles) + gap * (len(tiles) - 1), h + label), 'white')
draw = ImageDraw.Draw(canvas)
left = 0
for side, tile in tiles:
    draw.text((left, 2), '原型' if side == 'proto' else '实现', fill='black', font=font)
    canvas.paste(tile, (left, label))
    left += tile.width + gap
os.makedirs(os.path.join(ROOT, 'crops'), exist_ok=True)
out = os.path.join(ROOT, 'crops', f'{name}.png')
canvas.save(out)
print(out, canvas.size)
