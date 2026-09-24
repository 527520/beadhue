'use client';

import { Settings, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { iconButtonVariants } from '@/components/ui/icon-button';
import { TabLink, TabLinks } from '@/components/ui/tabs';
import { MobileTopBack, MobileTopSpacer, MobileTopTitle } from '@/components/shell/mobile-topbar';
import { ShellLink } from '@/components/shell/shell-context';
import { SiteShell } from '@/components/shell/site-shell';
import { formatCount } from '@/components/me/format';
import { MeProvider, type MeStats, type MeViewer } from '@/components/me/me-context';

const t = zhCN.shell.mePages;
const h = zhCN.me.head;
const TABS = [
  ['/me', t.designs],
  ['/me/public', t.public],
  ['/me/likes', t.likes],
  ['/me/palettes', t.palettes],
] as const;

function MeMobileTop({ settings }: { settings: boolean }) {
  if (settings) {
    return (
      <>
        <MobileTopBack href="/me" label={t.backToMe} />
        <MobileTopTitle>{t.settings}</MobileTopTitle>
        <MobileTopSpacer />
      </>
    );
  }
  return (
    <>
      <MobileTopSpacer size="sm" />
      <MobileTopTitle>{t.title}</MobileTopTitle>
      <ShellLink href="/me/settings" aria-label={t.settings} className={iconButtonVariants()}>
        <Settings aria-hidden="true" strokeWidth={1.75} />
      </ShellLink>
    </>
  );
}

/** 页头统计行：「设计 6 · 公开 4 · 获赞 5.2k」；游客与未验证账号只有说明文字。 */
function StatLine({ items }: { items: ReadonlyArray<readonly [string, string | null]> }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-3">
      {items.map(([label, value], index) => (
        <Fragment key={label}>
          {index > 0 ? <span aria-hidden="true" className="text-ink-4">·</span> : null}
          <span>
            {label}
            {value === null ? null : <b className="ml-1 font-semibold text-ink tabular-nums">{value}</b>}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

function ProfileHead({ viewer, stats, designCount }: { viewer: MeViewer | null; stats: MeStats | null; designCount: number | null }) {
  const avatarClass = 'max-md:size-14 max-md:text-title-1';
  let face: ReactNode;
  let name: string;
  let items: ReadonlyArray<readonly [string, string | null]>;
  if (!viewer) {
    face = (
      <span aria-hidden="true" className="grid size-18 shrink-0 place-items-center rounded-full bg-bg-muted text-ink-3 max-md:size-14 [&>svg]:size-8 max-md:[&>svg]:size-6">
        <User strokeWidth={1.75} />
      </span>
    );
    name = h.guestName;
    items = [[h.guestStatus, null], [h.guestHint, null]];
  } else {
    face = <Avatar id={viewer.avatarId} name={viewer.name} color={viewer.avatarColor ?? undefined} size="xl" className={avatarClass} />;
    name = viewer.name;
    items = viewer.verified
      ? [[h.designs, String(designCount ?? stats?.designs ?? 0)], [h.public, String(stats?.publicWorks ?? 0)], [h.likes, formatCount(stats?.likes ?? 0)]]
      : [[h.unverified, null], [h.unverifiedHint, null]];
  }
  return (
    <header className="flex items-center gap-5 pt-8 pb-6 max-md:gap-4 max-md:pt-4 max-md:pb-5">
      {face}
      <div className="grid min-w-0 flex-1 gap-1">
        <h1 className="truncate text-title-1 text-ink max-md:text-title-2">{name}</h1>
        <StatLine items={items} />
      </div>
      {viewer ? (
        <div className="flex shrink-0 items-center gap-2 max-md:hidden">
          {viewer.verified && viewer.publicAuthorId ? (
            <Link href={`/u/${encodeURIComponent(viewer.publicAuthorId)}`} className={buttonVariants({ variant: 'ghost' })}>{h.publicProfile}</Link>
          ) : null}
          <Link href="/me/settings" className={buttonVariants({ variant: 'secondary' })}>
            <Settings aria-hidden="true" strokeWidth={1.75} />
            {h.settings}
          </Link>
        </div>
      ) : null}
    </header>
  );
}

/**
 * 「我的」布局（D66，原型 me.js）：站点外壳 + 头部（头像、名字、统计、公开主页 / 账号设置）+ 链接式页签；
 * 账号设置页自带版式，不显示头部与页签。页头统计由服务端布局给出初值，增删设计、撤回公开后重新读取。
 */
export function MeShell({ viewer, stats: initialStats, children }: { viewer: MeViewer | null; stats: MeStats | null; children: ReactNode }) {
  const pathname = usePathname() ?? '/me';
  const settings = pathname.startsWith('/me/settings');
  const [stats, setStats] = useState(initialStats);
  const [serverStats, setServerStats] = useState(initialStats);
  if (serverStats !== initialStats) {
    setServerStats(initialStats);
    setStats(initialStats);
  }
  const [designCount, setDesignCount] = useState<number | null>(null);
  const verified = Boolean(viewer?.verified);
  const refreshStats = useCallback(() => {
    if (!verified) return;
    void fetch('/api/me/stats', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<MeStats>) : null))
      .then((next) => {
        if (next && Number.isFinite(next.designs)) setStats(next);
      })
      .catch(() => undefined);
  }, [verified]);
  const value = useMemo(() => ({ viewer, stats, designCount, setDesignCount, refreshStats }), [viewer, stats, designCount, refreshStats]);
  const designTabCount = designCount ?? (verified ? stats?.designs : undefined);

  return (
    <SiteShell nav="me" topbarCta="secondary" mobileTop={<MeMobileTop settings={settings} />}>
      <MeProvider value={value}>
        {settings ? (
          children
        ) : (
          <div data-ui="" className="page-container pb-8">
            <ProfileHead viewer={viewer} stats={stats} designCount={designCount} />
            <TabLinks label={t.tabs} className="mb-6 max-md:-mx-gutter max-md:mb-4 max-md:gap-6 max-md:px-gutter">
              {TABS.map(([href, label]) => (
                <TabLink key={href} href={href} current={pathname === href} count={href === '/me' && designTabCount !== undefined ? designTabCount : undefined}>
                  {label}
                </TabLink>
              ))}
            </TabLinks>
            {children}
          </div>
        )}
      </MeProvider>
    </SiteShell>
  );
}
