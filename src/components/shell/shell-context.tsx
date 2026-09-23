'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ComponentProps, type MouseEvent } from 'react';

/** 顶栏 / 底栏高亮：发现 · 创作 · 我的；null 表示都不高亮（作者主页、帮助等）。 */
export type SiteNav = 'discover' | 'create' | 'me' | null;

interface ShellNavigation {
  /** 站内跳转（搜索提交等）；页面声明了离开拦截时交给它。 */
  navigate: (href: string, options?: { replace?: boolean }) => void;
  /** 外壳里链接的普通左键点击：页面声明了离开拦截（工作台先保存再走）时接管。 */
  intercept: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}

const ShellNavigationContext = createContext<ShellNavigation | null>(null);

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function ShellNavigationProvider({ onNavigate, children }: { onNavigate?: (href: string) => void; children: React.ReactNode }) {
  const router = useRouter();
  const navigate = useCallback((href: string, options?: { replace?: boolean }) => {
    if (onNavigate) onNavigate(href);
    else if (options?.replace) router.replace(href);
    else router.push(href);
  }, [onNavigate, router]);
  const intercept = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!onNavigate || !isPlainLeftClick(event) || event.defaultPrevented) return;
    event.preventDefault();
    onNavigate(href);
  }, [onNavigate]);
  const value = useMemo(() => ({ navigate, intercept }), [navigate, intercept]);
  return <ShellNavigationContext value={value}>{children}</ShellNavigationContext>;
}

export function useShellNavigation(): ShellNavigation {
  const context = useContext(ShellNavigationContext);
  if (!context) throw new Error('useShellNavigation must be used inside <SiteShell>');
  return context;
}

/** 外壳里的站内链接：保留 <a> 语义（中键 / 新标签打开），普通点击交给离开拦截。 */
export function ShellLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const { intercept } = useShellNavigation();
  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        intercept(event, href);
      }}
      {...props}
    />
  );
}
