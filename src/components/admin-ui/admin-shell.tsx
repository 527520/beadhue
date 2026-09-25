'use client';

import { ArrowLeft, ChevronDown, House, LayoutGrid, LogOut, Menu as MenuIcon, PanelLeft, Search, Settings, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AdminOverview } from '@/lib/admin/overview';
import type { UserRole } from '@/lib/auth/authorization';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { notifyAuthStatusChanged, useAuthStatus } from '@/components/account/useAuthStatus';
import { BrandMark } from '@/components/shell/brand';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger, menuItemClass, menuPopupClass } from '@/components/ui/menu';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { sectionOf, visibleSections, type AdminSection } from './sections';

const t = zhCN.adminUi.shell;
const SIDE_KEY = 'beadhue.admin.side';
const DESK = '(min-width: 1024px)';
const TABLET = '(min-width: 768px) and (max-width: 1023px)';

interface CountsContext { counts: AdminOverview | null; refresh: () => void }
const Counts = createContext<CountsContext>({ counts: null, refresh: () => {} });
/** 侧栏待办计数；处理完一项后调用 refresh 让侧栏与总览同步。 */
export function useAdminCounts(): CountsContext { return useContext(Counts); }

const readCollapsed = () => { try { return window.localStorage.getItem(SIDE_KEY) === 'collapsed'; } catch { return false; } };

function NavItem({ section, active, compact, count, onNavigate }: { section: AdminSection; active: boolean; compact: boolean; count: number; onNavigate: () => void }) {
  const label = zhCN.adminUi.sections[section.id].label;
  const Icon = section.icon;
  const link = (
    <Link
      href={section.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={count > 0 ? t.pending(label, count) : label}
      className={cn(
        'relative flex h-10 items-center gap-3 rounded-md px-3 text-body-sm font-medium whitespace-nowrap text-ink-2 transition-colors duration-state ease-standard',
        'hover:bg-bg-subtle hover:text-ink focus-visible:focus-ring aria-[current=page]:bg-bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-ink',
        '[&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-ink-3 aria-[current=page]:[&>svg]:text-ink',
        compact && 'w-10 justify-center px-0',
      )}
    >
      <Icon aria-hidden="true" strokeWidth={1.75} />
      {compact ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {count > 0 ? (
        <span aria-hidden="true" className={cn(
          'inline-grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-caption leading-none font-semibold text-on-ink tabular-nums',
          compact && 'absolute -top-px -right-1.5 h-4.5 min-w-4.5 px-1.25 ring-2 ring-bg',
        )}>{count > 99 ? '99+' : count}</span>
      ) : null}
    </Link>
  );
  return compact ? <Tooltip content={label} side="right">{link}</Tooltip> : link;
}

function BrandLink({ compact }: { compact: boolean }) {
  return (
    <Link href="/admin" aria-label={t.home} className="inline-flex min-w-0 items-center gap-2.5 rounded-sm text-ink focus-visible:focus-ring">
      <BrandMark />
      {compact ? null : <>
        <b className="font-brand text-title-3 leading-none font-normal tracking-brand text-ink">{zhCN.shell.brandName}</b>
        <span className="text-caption whitespace-nowrap text-ink-3">{t.tag}</span>
      </>}
    </Link>
  );
}

const SCOPES = ['works', 'users', 'comments', 'logs'] as const;

/** 搜索范围与侧栏同一口径：审核员看不到人员、日志，也就不给这两个入口。 */
function ScopeLinks({ q, role, onPick }: { q: string; role: UserRole; onPick: () => void }) {
  const visible = new Set(visibleSections(role).map((section) => section.id));
  return (
    <div role="menu" aria-label={t.searchScopes} className="grid">
      {SCOPES.filter((scope) => visible.has(scope)).map((scope, index) => (
        <Link key={scope} role="menuitem" href={`/admin/${scope}?q=${encodeURIComponent(q)}`} onClick={onPick} className={cn(menuItemClass, 'hover:bg-bg-muted focus-visible:bg-bg-muted')}>
          <Search aria-hidden="true" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{t.scopes[scope]}「<b className="font-semibold text-ink">{q}</b>」</span>
          {index === 0 ? <span className="ml-auto text-caption font-normal text-ink-3">{t.enterHint}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/** 顶栏搜索：输入后在下方列出搜索范围，回车默认搜作品；按 / 聚焦。 */
function TopSearch({ role }: { role: UserRole }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || target?.closest('input, textarea, select, [contenteditable]') || document.querySelector('[role=dialog]')) return;
      const input = wrap.current?.querySelector('input');
      if (input && input.offsetParent) { event.preventDefault(); input.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const value = q.trim();
  return (
    <form
      ref={wrap}
      role="search"
      aria-label={t.search}
      className="relative max-md:hidden w-80 min-w-0 shrink"
      onSubmit={(event) => { event.preventDefault(); if (value) { setOpen(false); router.push(`/admin/works?q=${encodeURIComponent(value)}`); } }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
    >
      <SearchField
        value={q}
        onValueChange={(next) => { setQ(next); setOpen(Boolean(next.trim())); }}
        onFocus={() => setOpen(Boolean(value))}
        placeholder={t.search}
        aria-label={t.search}
        autoComplete="off"
        shortcut={<Kbd>/</Kbd>}
        wrapperClassName="h-control-md pl-3.5"
        className="text-body-sm"
      />
      {open && value ? (
        <div data-ui="" className={cn(menuPopupClass, 'absolute top-full left-0 z-60 mt-2 w-full max-w-none')}>
          <ScopeLinks q={value} role={role} onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </form>
  );
}

function MobileSearch({ role }: { role: UserRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const value = q.trim();
  return (
    <>
      <IconButton label={t.searchTitle} className="md:hidden" onClick={() => setOpen(true)}><Search aria-hidden="true" strokeWidth={1.75} /></IconButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.searchTitle}</DialogTitle></DialogHeader>
          <DialogBody>
            <form role="search" aria-label={t.search} onSubmit={(event) => { event.preventDefault(); if (value) { setOpen(false); router.push(`/admin/works?q=${encodeURIComponent(value)}`); } }}>
              <SearchField value={q} onValueChange={setQ} placeholder={t.search} aria-label={t.search} autoComplete="off" autoFocus wrapperClassName="mb-2" />
            </form>
            {value ? <ScopeLinks q={value} role={role} onPick={() => setOpen(false)} /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountButton() {
  const auth = useAuthStatus();
  const router = useRouter();
  const toast = useToast();
  if (auth.kind !== 'user') return <span className="size-10" aria-hidden="true" />;
  const name = auth.username?.trim() || auth.email.split('@')[0] || auth.email;
  const id = auth.publicAuthorId ?? auth.email;
  const icon = (Icon: typeof User) => <Icon aria-hidden="true" strokeWidth={1.75} />;
  const logout = async () => {
    try {
      const { createBeadhueApi } = await import('@/lib/sync/api');
      await createBeadhueApi().logout();
      notifyAuthStatusChanged();
      toast(zhCN.shell.account.loggedOut);
      router.push('/');
    } catch { toast(zhCN.shell.account.logoutFailed); }
  };
  return (
    <Menu>
      <MenuTrigger aria-label={t.account} className="inline-flex h-control-md items-center gap-2 rounded-full pr-2.5 pl-1 text-body-sm font-medium whitespace-nowrap text-ink transition-colors duration-state hover:bg-bg-muted focus-visible:focus-ring max-md:w-control-md max-md:justify-center max-md:p-0">
        <Avatar id={id} name={name} size="sm" />
        <span className="max-md:hidden">{name}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 text-ink-3 max-md:hidden" />
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-3">
          <Avatar id={id} name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-title-3 text-ink">{name}</div>
            <div className="truncate text-body-sm text-ink-3">{auth.email}</div>
          </div>
          <Badge tone="official">{auth.role === 'admin' ? t.roles.admin : t.roles.moderator}</Badge>
        </div>
        <MenuSeparator />
        <MenuLinkItem icon={icon(House)} render={<Link href="/" />}>{t.menu.site}</MenuLinkItem>
        <MenuLinkItem icon={icon(User)} render={<Link href="/me" />}>{t.menu.me}</MenuLinkItem>
        <MenuLinkItem icon={icon(Settings)} render={<Link href="/me/settings" />}>{t.menu.settings}</MenuLinkItem>
        {process.env.NODE_ENV !== 'production' ? <MenuLinkItem icon={icon(LayoutGrid)} render={<Link href="/dev/ui" />}>{t.menu.components}</MenuLinkItem> : null}
        <MenuSeparator />
        <MenuItem icon={icon(LogOut)} onClick={() => void logout()}>{t.menu.logout}</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * 后台外壳：浅色侧栏（分组导航、待办计数、可折叠为图标栏；768–1023 默认图标栏、
 * 展开时浮在内容上；手机为抽屉）+ 顶栏（面包屑、搜索、头像菜单）。后台不显示统计同意浮卡。
 */
export function AdminShell({ role, children }: { role: UserRole; children: ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const desk = useMediaQuery(DESK, true);
  const tablet = useMediaQuery(TABLET);
  const [collapsed, setCollapsed] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [counts, setCounts] = useState<AdminOverview | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const current = sectionOf(pathname);
  const sections = visibleSections(role);
  const compact = desk ? collapsed : tablet ? !railOpen : false;

  useEffect(() => { const timer = window.setTimeout(() => setCollapsed(readCollapsed()), 0); return () => window.clearTimeout(timer); }, []);
  const refresh = useCallback(() => {
    // 角标只是提示：读不到就不显示，不阻塞导航也不重试。
    fetch('/api/admin/overview', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data && typeof data === 'object') setCounts(data as AdminOverview); })
      .catch(() => {});
  }, []);
  useEffect(() => { const timer = window.setTimeout(refresh, 0); return () => window.clearTimeout(timer); }, [refresh, pathname]);
  useEffect(() => {
    if (!drawer && !railOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDrawer(false); setRailOpen(false); if (drawer) menuButton.current?.focus(); } };
    const onDown = (event: PointerEvent) => { if (railOpen && !sideRef.current?.contains(event.target as Node)) setRailOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [drawer, railOpen]);
  useEffect(() => {
    if (drawer) sideRef.current?.querySelector<HTMLElement>('a[aria-current=page]')?.focus();
  }, [drawer]);

  const toggle = () => {
    if (desk) {
      const next = !collapsed;
      setCollapsed(next);
      try { window.localStorage.setItem(SIDE_KEY, next ? 'collapsed' : 'expanded'); } catch { /* 存不下只影响下次打开 */ }
    } else setRailOpen(!railOpen);
  };
  const closeNav = () => { setDrawer(false); setRailOpen(false); };
  const groups = Object.keys(t.groups) as Array<keyof typeof t.groups>;
  const toggleLabel = compact ? t.expand : t.collapse;

  return (
    <Counts value={{ counts, refresh }}>
      <div data-ui="" className={cn('min-h-dvh bg-bg-subtle md:grid md:grid-cols-[64px_minmax(0,1fr)]', desk && !collapsed && 'lg:grid-cols-[240px_minmax(0,1fr)]')}>
        <aside
          ref={sideRef}
          id="admin-side"
          aria-label={t.nav}
          className={cn(
            'z-70 flex h-dvh flex-col border-r border-line bg-bg',
            'max-md:invisible max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-admin-drawer max-md:-translate-x-full max-md:shadow-dialog max-md:transition-[translate,visibility] max-md:duration-enter max-md:ease-standard',
            drawer && 'max-md:visible max-md:translate-x-0',
            'md:sticky md:top-0 md:z-40',
            compact ? 'md:w-16' : 'md:w-60',
            tablet && railOpen && 'shadow-dialog',
          )}
        >
          <div className={cn('flex shrink-0 items-center gap-2', compact ? 'flex-col justify-center gap-2 pt-4 pb-1' : 'h-topbar pr-3 pl-5')}>
            <BrandLink compact={compact} />
            <IconButton size="sm" label={toggleLabel} tooltipSide="right" aria-controls="admin-side" aria-expanded={!compact} onClick={toggle} className={cn('text-ink-3 max-md:hidden', !compact && 'ml-auto')}>
              <PanelLeft aria-hidden="true" strokeWidth={1.75} className={cn('transition-transform duration-state', compact && '-scale-x-100')} />
            </IconButton>
            <IconButton size="sm" label={t.closeNav} tooltip={false} onClick={() => { closeNav(); menuButton.current?.focus(); }} className="ml-auto md:hidden">
              <X aria-hidden="true" strokeWidth={1.75} />
            </IconButton>
          </div>
          <nav aria-label={t.nav} className={cn('min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 [scrollbar-width:thin]', compact && 'overflow-visible')}>
            {groups.map((group, index) => {
              const items = sections.filter((section) => section.group === group);
              if (!items.length) return null;
              return (
                <div key={group} role="group" aria-label={t.groups[group]} className={cn('grid gap-0.5 pt-3', compact && 'mt-2 pt-2', compact && index > 0 && 'border-t border-line')}>
                  {compact ? null : <span className="px-3 pb-1.5 text-caption text-ink-3">{t.groups[group]}</span>}
                  {items.map((section) => (
                    <NavItem key={section.id} section={section} active={section.id === current.id} compact={compact}
                      count={section.count && counts ? Number(counts[section.count] ?? 0) : 0} onNavigate={closeNav} />
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="shrink-0 border-t border-line p-3 pb-safe">
            {compact ? (
              <Tooltip content={t.back} side="right">
                <Link href="/" aria-label={t.back} className="flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-bg-subtle focus-visible:focus-ring [&>svg]:size-4.5 [&>svg]:text-ink-3">
                  <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
                </Link>
              </Tooltip>
            ) : (
              <Link href="/" className="flex h-10 items-center gap-3 rounded-md px-3 text-body-sm font-medium text-ink-2 hover:bg-bg-subtle hover:text-ink focus-visible:focus-ring [&>svg]:size-4.5 [&>svg]:text-ink-3">
                <ArrowLeft aria-hidden="true" strokeWidth={1.75} />{t.back}
              </Link>
            )}
          </div>
        </aside>
        <div
          aria-hidden="true"
          onClick={closeNav}
          className={cn('fixed inset-0 z-65 bg-scrim opacity-0 transition-opacity duration-enter md:hidden', drawer ? 'opacity-100' : 'pointer-events-none')}
        />
        <div className="flex min-w-0 flex-col" inert={drawer || undefined}>
          <header className="sticky top-0 z-30 flex h-topbar items-center gap-3 border-b border-line bg-bg px-gutter max-md:gap-1 max-md:px-2">
            <IconButton ref={menuButton} label={t.openNav} tooltip={false} aria-controls="admin-side" aria-expanded={drawer} onClick={() => setDrawer(true)} className="md:hidden">
              <MenuIcon aria-hidden="true" strokeWidth={1.75} />
            </IconButton>
            <Link href="/admin" aria-label={t.brandHome} className="ml-1 inline-flex items-center gap-2 text-body leading-none font-semibold whitespace-nowrap text-ink md:hidden">
              <BrandMark />{t.tag}
            </Link>
            <nav aria-label={t.crumbs} className="flex min-w-0 items-center gap-2 text-body-sm whitespace-nowrap text-ink-3 max-md:hidden">
              <Link href="/admin" className="rounded-sm hover:text-ink focus-visible:focus-ring">{t.crumbRoot}</Link>
              <span aria-hidden="true" className="text-line-strong">/</span>
              <span aria-current="page" className="font-semibold text-ink">{zhCN.adminUi.sections[current.id].label}</span>
            </nav>
            <span className="min-w-0 flex-1" />
            <TopSearch role={role} />
            <MobileSearch role={role} />
            <AccountButton />
          </header>
          <main id="main" tabIndex={-1} className="flex w-full max-w-admin flex-1 flex-col gap-5 px-gutter pt-6 pb-10 outline-none max-md:gap-4 max-md:px-4 max-md:pt-4 max-md:pb-8">
            {children}
          </main>
        </div>
      </div>
    </Counts>
  );
}
