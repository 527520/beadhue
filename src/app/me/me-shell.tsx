'use client';

import { Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { IconButton } from '@/components/ui/icon-button';
import { TabLink, TabLinks } from '@/components/ui/tabs';
import { MobileTopBack, MobileTopSpacer, MobileTopTitle } from '@/components/shell/mobile-topbar';
import { ShellLink } from '@/components/shell/shell-context';
import { SiteShell } from '@/components/shell/site-shell';

const t = zhCN.shell.mePages;
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
      <IconButton label={t.settings} tooltip={false} nativeButton={false} render={<ShellLink href="/me/settings" />}>
        <Settings aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
    </>
  );
}

/** 「我的」布局骨架（D66）：外壳 + 链接式页签（设计 · 公开作品 · 喜欢 · 色板）；头部与各页内容由票 06 重做。 */
export function MeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/me';
  const settings = pathname.startsWith('/me/settings');
  return (
    <SiteShell nav="me" topbarCta="secondary" mobileTop={<MeMobileTop settings={settings} />}>
      {settings ? null : (
        <div data-ui="" className="page-container pt-6 max-md:pt-3">
          <TabLinks label={t.tabs}>
            {TABS.map(([href, label]) => (
              <TabLink key={href} href={href} current={pathname === href}>{label}</TabLink>
            ))}
          </TabLinks>
        </div>
      )}
      {children}
    </SiteShell>
  );
}
