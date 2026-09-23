'use client';

import { SOURCE_REPO_URL } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';
import { Brand } from './brand';
import { ShellLink } from './shell-context';

const t = zhCN.shell.footer;
const linkClass = 'rounded-sm transition-colors duration-state hover:text-ink focus-visible:focus-ring';

/** 页脚（桌面）：标志 + 一句话 + 帮助 / 隐私 / 社区规范 / 关于 / 源码；手机不显示。 */
export function SiteFooter() {
  return (
    <footer data-ui="" className="mt-16 border-t border-line max-md:hidden">
      <div className="page-container-wide flex flex-wrap items-center gap-x-6 gap-y-3 pt-6 pb-8 text-body-sm text-ink-3">
        <Brand />
        <span>{t.tagline}</span>
        <nav aria-label={t.label} className="ml-auto flex flex-wrap gap-x-5 gap-y-2">
          <ShellLink href="/help" className={linkClass}>{t.help}</ShellLink>
          <ShellLink href="/privacy" className={linkClass}>{t.privacy}</ShellLink>
          <ShellLink href="/community/rules" className={linkClass}>{t.rules}</ShellLink>
          <ShellLink href="/about" className={linkClass}>{t.about}</ShellLink>
          <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer" className={linkClass}>{t.source}</a>
        </nav>
      </div>
    </footer>
  );
}
