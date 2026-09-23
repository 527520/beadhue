"""票 01 视觉对照：把 shoot-kit.mjs 截的原型与实现按区块并排（左原型、右实现）。

python3 compare-kit.py <width> [section ...] [--proto-only] [--scale=0.5]
输出 evidence/impl/01/cmp-<width>-<section>.png；不给 section 时输出全部区块，另输出页头 cmp-<width>-head.png。
"""
import json
import sys
from pathlib import Path
from PIL import Image

OUT = Path('.scratch/ui-rebuild/evidence/impl/01')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = [a for a in sys.argv[1:] if a.startswith('--')]
width = args[0]
wanted = set(args[1:])
proto_only = '--proto-only' in flags
scale = next((float(f.split('=')[1]) for f in flags if f.startswith('--scale=')), 1.0)


def load(name):
    meta = json.loads((OUT / f'{name}-{width}.json').read_text())
    return Image.open(OUT / f'{name}-{width}.png'), meta


proto, pm = load('proto')
impl, im = (None, None) if proto_only else load('impl')


def crop(image, meta, top, height):
    dpr = meta['dpr']
    return image.crop((0, top * dpr, image.width, min(image.height, (top + height) * dpr)))


def emit(name, left, right):
    gap = 24
    w = left.width + (right.width + gap if right else 0)
    h = max(left.height, right.height if right else 0)
    canvas = Image.new('RGB', (w, h), (255, 64, 160))
    canvas.paste(left, (0, 0))
    if right:
        canvas.paste(right, (left.width + gap, 0))
    if scale != 1.0:
        canvas = canvas.resize((round(canvas.width * scale), round(canvas.height * scale)), Image.LANCZOS)
    path = OUT / f'cmp-{width}-{name}.png'
    canvas.save(path)
    print(path, canvas.size)


if not wanted or 'head' in wanted:
    emit('head', crop(proto, pm, 0, pm['head']), crop(impl, im, 0, im['head']) if impl else None)
isec = {s['id']: s for s in (im['sections'] if im else [])}
for section in pm['sections']:
    if wanted and section['id'] not in wanted:
        continue
    left = crop(proto, pm, section['top'], section['height'])
    other = isec.get(section['id'])
    right = crop(impl, im, other['top'], other['height']) if other else None
    emit(section['id'], left, right)
