#!/usr/bin/env python3
"""R15 终审对照：把 audit-matrix.mjs 截的同场景同宽度 proto / impl 左右拼成一张，并生成索引。

用法（仓库根目录）：python3 .scratch/ui-rebuild/tools/audit-compose.py [场景名或前缀*…]
输入：evidence/audit/report.json 与 raw/*.png
输出：evidence/audit/pairs/<场景>-<宽度>.png（顶部标签：场景名、宽度、「原型」「实现」与该张的异常标记；
      高度按较高的一张补齐，总宽超过 2400px 时整体等比缩小；没有原型的场景只放实现），
      evidence/audit/index.md（全部对照图 + report 里的异常）。
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.scratch/ui-rebuild/evidence/audit')
RAW = ROOT / 'raw'
PAIRS = ROOT / 'pairs'
MAX_WIDTH = 2400
GAP = 24
MARGIN = 16
HEADER = 76
BG = (244, 244, 245)
PAD = (228, 228, 231)
INK = (28, 28, 30)
MUTED = (110, 110, 118)
ALERT = (196, 43, 28)
WIDTH_ORDER = [1440, 1024, 768, 390, 350]

FONT_CANDIDATES = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/Library/Fonts/Arial Unicode.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
]


def font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


TITLE = font(24)
LABEL = font(18)
SMALL = font(15)


def flags(shot):
    if not shot:
        return []
    out = []
    if shot.get('failed'):
        out.append(f"失败：{shot['failed'][:60]}")
    if shot.get('missing'):
        out.append(f"找不到选择器 ×{len(shot['missing'])}")
    if shot.get('errors'):
        out.append(f"页面报错 ×{len(shot['errors'])}")
    if shot.get('overflow', 0) > 0:
        out.append(f"横向溢出 {shot['overflow']}px")
    if len(shot.get('primaries') or []) > 1:
        out.append(f"主按钮 ×{len(shot['primaries'])}")
    if shot.get('skipped'):
        out.append(f"跳过步骤 ×{len(shot['skipped'])}")
    return out


def compose(scene, width, proto_shot, impl_shot, note):
    columns = []
    for label, shot in (('原型', proto_shot), ('实现', impl_shot)):
        if not shot:
            continue
        path = ROOT / shot['file']
        if not path.exists():
            continue
        columns.append((label, Image.open(path).convert('RGB'), shot))
    if not columns:
        return None
    if len(columns) == 1 and columns[0][0] == '实现' and proto_shot is None:
        columns = [('实现（原型没有此页面 / 状态）', columns[0][1], columns[0][2])]
    height = max(image.height for _, image, _ in columns)
    total = MARGIN * 2 + sum(image.width for _, image, _ in columns) + GAP * (len(columns) - 1)
    canvas = Image.new('RGB', (total, HEADER + height + MARGIN), BG)
    draw = ImageDraw.Draw(canvas)
    title = f'{scene} · {width}px'
    draw.text((MARGIN, 8), title, font=TITLE, fill=INK)
    if note:
        title_width = draw.textlength(title, font=TITLE)
        draw.text((MARGIN + title_width + 16, 14), note[:90], font=SMALL, fill=MUTED)
    x = MARGIN
    for label, image, shot in columns:
        draw.text((x, 44), label, font=LABEL, fill=INK)
        marks = flags(shot)
        if marks:
            label_width = draw.textlength(label, font=LABEL)
            draw.text((x + label_width + 12, 47), '；'.join(marks)[:80], font=SMALL, fill=ALERT)
        canvas.paste(PAD, (x, HEADER, x + image.width, HEADER + height))
        canvas.paste(image, (x, HEADER))
        x += image.width + GAP
    if canvas.width > MAX_WIDTH:
        ratio = MAX_WIDTH / canvas.width
        canvas = canvas.resize((MAX_WIDTH, round(canvas.height * ratio)), Image.LANCZOS)
    return canvas


def matches(name, patterns):
    if not patterns:
        return True
    return any(name.startswith(p[:-1]) if p.endswith('*') else name == p for p in patterns)


def main():
    patterns = sys.argv[1:]
    report = json.loads((ROOT / 'report.json').read_text(encoding='utf-8'))
    scenes = {scene['name']: scene for scene in report.get('scenes', [])}
    shots = defaultdict(dict)
    for shot in report['shots']:
        shots[(shot['scene'], shot['width'])][shot['side']] = shot
    PAIRS.mkdir(parents=True, exist_ok=True)
    made = 0
    pairs_by_scene = defaultdict(list)
    for (scene, width), sides in sorted(shots.items(), key=lambda item: (item[0][0], WIDTH_ORDER.index(item[0][1]) if item[0][1] in WIDTH_ORDER else 99)):
        meta = scenes.get(scene, {})
        proto_expected = meta.get('proto') is not None if meta else 'proto' in sides
        name = f'{scene}-{width}.png'
        pairs_by_scene[scene].append((width, name))
        if not matches(scene, patterns):
            continue
        image = compose(scene, width, sides.get('proto') if proto_expected else None, sides.get('impl'), meta.get('note'))
        if image is None:
            continue
        image.save(PAIRS / name, optimize=True)
        made += 1
    write_index(report, scenes, shots, pairs_by_scene)
    print(f'拼好 {made} 张 → {PAIRS}；索引 → {ROOT / "index.md"}')


def write_index(report, scenes, shots, pairs_by_scene):
    lines = ['# R15 原型 vs 实现 对照索引', '']
    lines.append(f"实现：`{report.get('implBase')}`；原型：`{report.get('protoBase')}`；report 生成于 {report.get('generatedAt')}。")
    total_shots = len(report['shots'])
    lines.append(f'场景 {len(pairs_by_scene)} 个，截图 {total_shots} 张，对照图 {sum(len(v) for v in pairs_by_scene.values())} 张。')
    lines.append('')
    lines.append('对照图左为原型、右为实现；顶部红字是该张的异常标记（失败 / 找不到选择器 / 页面报错 / 横向溢出 / 视区内主按钮多于一个 / 跳过步骤）。')
    lines.append('')

    lines.append('## 异常汇总')
    lines.append('')
    sections = [
        ('截图失败', lambda s: s.get('failed'), lambda s: s['failed']),
        ('找不到选择器', lambda s: s.get('missing'), lambda s: '；'.join(s['missing'])),
        ('跳过的步骤（场景里写明的原因）', lambda s: s.get('skipped'), lambda s: '；'.join(s['skipped'])),
        ('页面报错', lambda s: s.get('errors'), lambda s: '；'.join(e[:140] for e in s['errors'][:3]) + (' …' if len(s['errors']) > 3 else '')),
        ('横向溢出', lambda s: s.get('overflow', 0) > 0, lambda s: f"{s['overflow']}px"),
        ('视区内主按钮多于一个', lambda s: len(s.get('primaries') or []) > 1, lambda s: ' / '.join(s['primaries'])),
    ]
    for title, test, detail in sections:
        hits = [s for s in report['shots'] if test(s)]
        lines.append(f'### {title}（{len(hits)}）')
        lines.append('')
        if not hits:
            lines.append('无。')
        for s in sorted(hits, key=lambda s: (s['scene'], s['width'], s['side'])):
            lines.append(f"- `{s['scene']}` {s['width']} {'原型' if s['side'] == 'proto' else '实现'}：{detail(s)} → [对照](pairs/{s['scene']}-{s['width']}.png)")
        lines.append('')
    http = defaultdict(set)
    for s in report['shots']:
        for item in s.get('http') or []:
            http[item].add(f"{s['scene']}-{s['width']}")
    lines.append(f'### HTTP 4xx/5xx 响应（{len(http)} 种，游客 401 等多为预期）')
    lines.append('')
    for item, where in sorted(http.items(), key=lambda kv: -len(kv[1])):
        sample = '、'.join(sorted(where)[:4])
        lines.append(f'- `{item}` ×{len(where)}（如 {sample}）')
    lines.append('')

    finals = sorted(((tag, name) for name, meta in scenes.items() for tag in meta.get('tags', []) if tag.startswith('final-')))
    if finals:
        lines.append('## shoot-final 22 屏对应')
        lines.append('')
        for tag, name in finals:
            lines.append(f"- {tag} → `{name}`：" + ' '.join(f'[{w}](pairs/{n})' for w, n in pairs_by_scene.get(name, [])))
        lines.append('')

    lines.append('## 全部对照图')
    groups = defaultdict(list)
    for name in pairs_by_scene:
        groups[scenes.get(name, {}).get('group', '其他')].append(name)
    for group, names in groups.items():
        lines.append('')
        lines.append(f'### {group}')
        lines.append('')
        for name in names:
            meta = scenes.get(name, {})
            who = {'guest': '游客', 'user': '用户', 'admin': '管理员', 'moderator': '版主'}
            identity = who.get(meta.get('who'), meta.get('who', ''))
            if meta.get('implWho') and meta.get('implWho') != meta.get('who'):
                identity += f"（实现侧{who.get(meta['implWho'], meta['implWho'])}）"
            links = ' '.join(f'[{w}](pairs/{n})' for w, n in pairs_by_scene[name])
            route = f"原型 `{meta.get('proto')}`" if meta.get('proto') else '原型无'
            route += f" · 实现 `{meta.get('impl')}`" if meta.get('impl') else ' · 实现无'
            note = f" — {meta['note']}" if meta.get('note') else ''
            lines.append(f"- **{name}**（{identity}{'，整页' if meta.get('full') else ''}）{links}<br>{route}{note}")
    (ROOT / 'index.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
