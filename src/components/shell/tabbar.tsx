'use client';

import { Compass, Plus, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { ShellLink, type SiteNav } from './shell-context';

const t = zhCN.shell;
const itemClass = cn(
  'grid justify-items-center gap-0.75 text-tabbar leading-none font-medium text-ink-3 focus-visible:focus-ring rounded-md',
  'aria-[current=page]:font-semibold aria-[current=page]:text-ink [&>svg]:size-6',
);

/** 手机底栏（< 768）：发现 · ＋ · 我的，中间主色圆钮直达创作；二级页（详情、编辑器）不渲染。 */
export function Tabbar({ nav }: { nav: SiteNav }) {
  return (
    <nav
      data-ui=""
      aria-label={t.mainNav}
      className="fixed inset-x-0 bottom-0 z-45 grid h-tabbar-safe grid-cols-3 items-center border-t border-line bg-bg/96 pb-safe backdrop-blur-md md:hidden"
    >
      <ShellLink href="/" aria-current={nav === 'discover' ? 'page' : undefined} className={itemClass}>
        <Compass aria-hidden="true" strokeWidth={1.75} />
        {t.discover}
      </ShellLink>
      <ShellLink
        href="/app"
        aria-label={t.create}
        aria-current={nav === 'create' ? 'page' : undefined}
        className="grid size-12 place-items-center justify-self-center rounded-full bg-accent text-on-accent shadow-fab transition-colors duration-state hover:bg-accent-hover focus-visible:focus-ring [&>svg]:size-6.5"
      >
        <Plus aria-hidden="true" strokeWidth={2.2} />
      </ShellLink>
      <ShellLink href="/me" aria-current={nav === 'me' ? 'page' : undefined} className={itemClass}>
        <User aria-hidden="true" strokeWidth={1.75} />
        {t.me}
      </ShellLink>
    </nav>
  );
}
