'use client';

import { Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { AccountMenu } from './account-menu';
import { Brand } from './brand';
import { useLoginDialog } from './login-dialog';
import { SearchBox } from './search-box';
import { ShellLink, type SiteNav } from './shell-context';
import { useScrolled } from './use-scrolled';

const t = zhCN.shell;
export type TopbarCta = 'primary' | 'secondary' | false;

export const NAV_ITEMS = [
  { id: 'discover', href: '/', label: t.discover },
  { id: 'create', href: '/app', label: t.create },
  { id: 'me', href: '/me', label: t.me },
] as const;

const navLinkClass = cn(
  'relative inline-flex h-10 items-center rounded-full px-3 text-body leading-none font-medium whitespace-nowrap text-ink-3',
  'transition-colors duration-state ease-standard hover:bg-bg-muted hover:text-ink focus-visible:focus-ring',
  'aria-[current=page]:font-semibold aria-[current=page]:text-ink',
  'after:absolute after:inset-x-3 after:-bottom-3 after:h-0.5 after:rounded-full after:content-[""] aria-[current=page]:after:bg-ink',
);

/** 账号位：已登录头像菜单；游客「登录」次按钮（打开登录弹窗）；探测中占位，不跳动。 */
export function AccountSlot() {
  const auth = useAuthStatus();
  const login = useLoginDialog();
  if (auth.kind === 'user') return <AccountMenu user={auth} />;
  if (auth.kind === 'loading') return <span aria-hidden="true" className="block h-10 w-18 rounded-full inset-ring-1 inset-ring-line" />;
  return <Button variant="outline" data-login="" onClick={() => login?.open()}>{t.login}</Button>;
}

function UploadButton({ variant }: { variant: 'primary' | 'secondary' }) {
  const compact = useMediaQuery('(max-width: 1023px)');
  return (
    <Tooltip content={t.upload} disabled={!compact}>
      <ShellLink href="/app" aria-label={t.upload} className={cn(buttonVariants({ variant: variant === 'primary' ? 'primary' : 'outline' }), 'max-lg:w-10 max-lg:gap-0 max-lg:px-0')}>
        <Upload aria-hidden="true" strokeWidth={1.75} />
        <span className="max-lg:hidden">{t.upload}</span>
      </ShellLink>
    </Tooltip>
  );
}

/** 桌面顶栏（≥768）：标志 ｜ 发现 · 创作 · 我的 ｜ 胶囊搜索 ｜ 上传图片 + 头像菜单；滚动后出现发丝边。 */
export function SiteTopbar({ nav, cta, account, query }: { nav: SiteNav; cta: TopbarCta; account: boolean; query: string }) {
  const scrolled = useScrolled();
  return (
    <header
      data-ui=""
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 h-topbar border-b border-transparent bg-bg/94 backdrop-blur-md backdrop-saturate-140 transition-colors duration-state ease-standard data-scrolled:border-line max-md:hidden"
    >
      <div className="page-container-wide flex h-full items-center gap-7 max-lg:gap-4">
        <Brand />
        <nav aria-label={t.mainNav} className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <ShellLink key={item.id} href={item.href} aria-current={nav === item.id ? 'page' : undefined} className={navLinkClass}>
              {item.label}
            </ShellLink>
          ))}
        </nav>
        <SearchBox key={query} query={query} className="ml-2 min-w-0 grow-0 shrink basis-search max-lg:ml-0 max-lg:flex-auto" />
        <div className="ml-auto flex items-center gap-2">
          {account ? <NotificationBell /> : null}
          {cta ? <UploadButton variant={cta} /> : null}
          {account ? <AccountSlot /> : null}
        </div>
      </div>
    </header>
  );
}
