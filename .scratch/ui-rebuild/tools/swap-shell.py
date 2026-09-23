# 票 03 一次性改写：把旧页面的 <main className="workspace-page"><SiteHeader …/> 换成 SiteShell + LegacyScope。
# 用法：python3 swap-shell.py <文件> '<SiteShell 属性>'
import re, sys

path, shell_props = sys.argv[1], sys.argv[2]
s = open(path, encoding='utf8').read()
m = re.search(r'<SiteHeader\b(.*?)/>', s, flags=re.S)
if not m:
    sys.exit(f'{path}: 找不到 SiteHeader')
attrs = m.group(1)
def attr(name):
    a = re.search(name + r'=(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|"[^"]*"|\'[^\']*\')', attrs)
    return a.group(1) if a else None
heading = ''
if 'hideHeading' not in attrs or re.search(r'hideHeading=\{', attrs):
    parts = [f'title={attr("title")}']
    if attr('subtitle'): parts.append(f'subtitle={attr("subtitle")}')
    if attr('primaryActions'): parts.append(f'actions={attr("primaryActions")}')
    heading = '<LegacyPageHeading ' + ' '.join(parts) + ' />'
s = s[:m.start()] + heading + s[m.end():]
s = s.replace('<main id="main" className="workspace-page">', f'<SiteShell {shell_props}><LegacyScope><div className="workspace-page">', 1)
idx = s.rfind('</main>')
s = s[:idx] + '</div></LegacyScope></SiteShell>' + s[idx + len('</main>'):]
imp = re.search(r'import SiteHeader from ["\']@/components/layout/SiteHeader["\'];?\n', s)
new_imp = "import { SiteShell } from '@/components/shell/site-shell';\nimport LegacyScope from '@/components/layout/LegacyScope';\n"
if heading: new_imp += "import LegacyPageHeading from '@/components/layout/LegacyPageHeading';\n"
s = s[:imp.start()] + new_imp + s[imp.end():]
open(path, 'w', encoding='utf8').write(s)
print('ok', path, 'heading' if heading else 'no-heading')
