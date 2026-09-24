'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { badgeText } from './notification-model';
import { NotificationCenter } from './notification-center';
import { useUnreadCount } from './use-unread-count';

const t = zhCN.shell.notifications;

/**
 * 顶栏铃铛（D70）：只对已登录用户显示；未读数用深墨小胶囊（主色不用于徽标）。
 * 桌面（顶栏，「上传图片」左侧）打开锚定弹出层；sheet 为真（发现页手机顶栏）打开底部面板。
 */
export function NotificationBell({ sheet = false }: { sheet?: boolean }) {
  const auth = useAuthStatus();
  if (auth.kind !== 'user') return null;
  return <SignedInBell user={auth.email} sheet={sheet} />;
}

function SignedInBell({ user, sheet }: { user: string; sheet: boolean }) {
  const count = useUnreadCount(user);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const trigger = (
    <IconButton label={count ? t.unread(count) : t.label} tooltip={sheet ? false : undefined} data-notifications="" className="relative data-popup-open:bg-bg-muted">
      <Bell aria-hidden="true" strokeWidth={1.75} />
      {count ? (
        <span
          aria-hidden="true"
          data-slot="unread-badge"
          className="pointer-events-none absolute top-1 left-5 inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink px-1 text-tabbar leading-none font-semibold text-on-ink tabular-nums ring-2 ring-bg"
        >
          {badgeText(count)}
        </span>
      ) : null}
    </IconButton>
  );
  if (sheet) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={trigger} />
        <DialogContent>{open ? <NotificationCenter sheet unreadCount={count} onClose={close} /> : null}</DialogContent>
      </Dialog>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent aria-label={zhCN.notifications.title} className="w-popover">
        <NotificationCenter unreadCount={count} onClose={close} />
      </PopoverContent>
    </Popover>
  );
}
