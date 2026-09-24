'use client';

import { ArrowLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton, iconButtonVariants } from '@/components/ui/icon-button';
import { avatarIdOf, displayNameOf } from './account-menu';
import { Brand } from './brand';
import { useLoginDialog } from './login-dialog';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ShellLink } from './shell-context';
import { useScrolled } from './use-scrolled';

const t = zhCN.shell;

/** 手机顶栏外框（< 768）：吸顶 56px、滚动后发丝边；内容由页面决定。与桌面顶栏同为 banner 地标，二者按宽度只显示一个。 */
export function MobileTopbarFrame({ children, className }: { children: ReactNode; className?: string }) {
  const scrolled = useScrolled();
  return (
    <header
      data-ui=""
      data-scrolled={scrolled || undefined}
      className={cn('sticky top-0 z-40 flex h-topbar items-center gap-1 border-b border-transparent bg-bg/96 pr-2 pl-4 backdrop-blur-md transition-colors duration-state ease-standard data-scrolled:border-line md:hidden', className)}
    >
      {children}
    </header>
  );
}

function MobileAccount() {
  const auth = useAuthStatus();
  const login = useLoginDialog();
  if (auth.kind === 'user') {
    return (
      <ShellLink href="/me" aria-label={t.me} className={iconButtonVariants()}>
        <Avatar id={avatarIdOf(auth)} name={displayNameOf(auth)} size="sm" />
      </ShellLink>
    );
  }
  if (auth.kind === 'loading') return <span aria-hidden="true" className="size-10" />;
  return <Button size="sm" variant="outline" data-login="" onClick={() => login?.open()}>{t.login}</Button>;
}

/** 默认手机顶栏：标志 + 搜索 + 头像 / 登录；发现页为标志 + 搜索 + 通知铃铛（游客仍是「登录」）。 */
export function DefaultMobileTop({ variant, account, onSearch }: { variant: 'default' | 'discover'; account: boolean; onSearch: () => void }) {
  const signedIn = useAuthStatus().kind === 'user';
  return (
    <>
      <Brand compact />
      <span className="flex-1" />
      <IconButton label={t.search.open} tooltip={false} data-mobile-search="" onClick={onSearch}>
        <Search aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      {variant === 'discover' && signedIn ? <NotificationBell sheet /> : account ? <MobileAccount /> : null}
    </>
  );
}

/** 页面自定义手机顶栏的零件：返回（有 href 走链接，否则返回上一页）、居中标题、占位。 */
export function MobileTopBack({ href, label = t.back }: { href?: string; label?: string }) {
  const router = useRouter();
  if (href) {
    return (
      <ShellLink href={href} aria-label={label} className={cn(iconButtonVariants(), 'hover:bg-bg-muted')}>
        <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
      </ShellLink>
    );
  }
  return (
    <IconButton label={label} tooltip={false} onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}>
      <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
    </IconButton>
  );
}

export function MobileTopTitle({ children }: { children: ReactNode }) {
  return <span className="min-w-0 flex-1 truncate text-center text-topbar text-ink">{children}</span>;
}

export function MobileTopSpacer({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <span aria-hidden="true" className={cn('shrink-0', size === 'sm' ? 'w-8' : 'w-12')} />;
}
