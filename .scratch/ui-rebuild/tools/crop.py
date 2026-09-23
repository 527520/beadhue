"""按区域裁切截图供细看：python3 crop.py <src.png> <x> <y> <w> <h> <out.png> [scale]"""
import sys
from PIL import Image

src, x, y, w, h, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
image = Image.open(src)
region = image.crop((x, y, min(image.width, x + w), min(image.height, y + h)))
if scale != 1.0:
    region = region.resize((round(region.width * scale), round(region.height * scale)), Image.LANCZOS)
region.save(out)
print(out, region.size)
