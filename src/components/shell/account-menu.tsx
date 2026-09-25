'use client';

import { CircleHelp, Folder, Lock, LogOut, Menu as MenuIcon, Palette, Settings, ShieldCheck, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { track } from '@/lib/analytics/client';
import { notifyAuthStatusChanged, type AuthStatus } from '@/components/account/useAuthStatus';
import { Avatar } from '@/components/ui/avatar';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { ShellLink } from './shell-context';

const t = zhCN.shell.account;
type User = Extract<AuthStatus, { kind: 'user' }>;

export function displayNameOf(user: User): string {
  return user.username?.trim() || user.email.split('@')[0] || user.email;
}

export function avatarIdOf(user: User): string {
  return user.publicAuthorId ?? user.email;
}

const icon = (Icon: typeof User) => <Icon aria-hidden="true" strokeWidth={1.75} />;

function StorageMeter() {
  const [usage, setUsage] = useState<{ bytes: number; quotaBytes: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/originals/usage', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { bytes?: number; quotaBytes?: number } | null) => {
        if (alive && body && Number.isFinite(body.bytes) && Number(body.quotaBytes) > 0) setUsage({ bytes: Number(body.bytes), quotaBytes: Number(body.quotaBytes) });
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!usage) return null;
  const gb = (value: number) => (value / 1024 ** 3).toFixed(2).replace(/\.?0+$/u, '') || '0';
  const percent = Math.min(100, (usage.bytes / usage.quotaBytes) * 100);
  return (
    <div className="px-2.5 pb-3">
      <div className="flex justify-between text-caption font-normal text-ink-3">
        <span>{t.storage}</span>
        <span className="tabular-nums">{t.storageUsage(gb(usage.bytes), gb(usage.quotaBytes))}</span>
      </div>
      <div role="progressbar" aria-label={t.storage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <i className="block h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** 头像菜单：原图空间、我的主页、我的设计、色板、账号设置、帮助、隐私、管理后台（审核员 / 管理员）、退出。 */
export function AccountMenu({ user }: { user: User }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const name = displayNameOf(user);
  const link = (href: string, label: string, Icon: typeof User) => (
    <MenuLinkItem icon={icon(Icon)} render={<ShellLink href={href} />}>{label}</MenuLinkItem>
  );
  const logout = async () => {
    try {
      const { createBeadhueApi } = await import('@/lib/sync/api');
      await createBeadhueApi().logout();
      track({ name: 'logout_succeeded', properties: {} });
      notifyAuthStatusChanged();
      toast(t.loggedOut);
      router.refresh();
    } catch {
      toast(t.logoutFailed);
    }
  };
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        data-account=""
        aria-label={zhCN.shell.accountMenu}
        className="inline-flex h-10 items-center gap-2 rounded-full pr-1 pl-3 inset-ring-1 inset-ring-line-strong transition-shadow duration-state ease-standard hover:shadow-float hover:inset-ring-ink focus-visible:focus-ring data-popup-open:inset-ring-ink"
      >
        <MenuIcon aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink-3" />
        <Avatar id={avatarIdOf(user)} name={name} color={user.avatarColor ?? undefined} size="sm" />
      </MenuTrigger>
      <MenuContent align="end" className="w-66">
        <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-3">
          <Avatar id={avatarIdOf(user)} name={name} color={user.avatarColor ?? undefined} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-title-3 text-ink">{name}</div>
            <div className="truncate text-caption font-normal text-ink-3">{user.email}</div>
          </div>
        </div>
        {open ? <StorageMeter /> : null}
        <MenuSeparator />
        {link('/me', t.home, User)}
        {link('/me', t.designs, Folder)}
        {link('/me/palettes', t.palettes, Palette)}
        {link('/me/settings', t.settings, Settings)}
        <MenuSeparator />
        {link('/help', t.help, CircleHelp)}
        {link('/privacy', t.privacy, Lock)}
        {user.role !== 'user' ? (
          <>
            <MenuSeparator />
            {link('/admin', t.admin, ShieldCheck)}
          </>
        ) : null}
        <MenuSeparator />
        <MenuItem icon={icon(LogOut)} onClick={() => void logout()}>{t.logout}</MenuItem>
      </MenuContent>
    </Menu>
  );
}
