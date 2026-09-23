'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { useLoginDialog } from './login-dialog';

const t = zhCN.shell.notifications;

/** 通知铃铛占位（票 11 换成通知弹出层）：登录后显示未读圆点，游客点开是登录弹窗。 */
export function NotificationBell() {
  const auth = useAuthStatus();
  const login = useLoginDialog();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const signedIn = auth.kind === 'user';
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void fetch('/api/me/notifications/unread-count', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { unreadCount?: number } | null) => { if (alive && body) setUnread(Number(body.unreadCount) || 0); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [signedIn]);
  const count = signedIn ? unread : 0;
  return (
    <IconButton
      label={count ? t.unread(count) : t.label}
      tooltip={false}
      className="relative"
      onClick={() => {
        if (!signedIn) login?.open();
        else toast(count ? t.unread(count) : t.empty, { icon: <Bell aria-hidden="true" strokeWidth={1.75} /> });
      }}
    >
      <Bell aria-hidden="true" strokeWidth={1.75} />
      {count ? <span aria-hidden="true" className="absolute top-2 right-2.5 size-2 rounded-full bg-ink ring-2 ring-bg" /> : null}
    </IconButton>
  );
}
