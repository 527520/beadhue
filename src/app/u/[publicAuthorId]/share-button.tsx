'use client';

import { Share2 } from 'lucide-react';
import { zhCN } from '@/messages/zh-CN';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';

const t = zhCN.shell.author;

/** 复制作者主页链接（手机顶栏右侧）。 */
export function ShareProfileButton() {
  const toast = useToast();
  return (
    <IconButton
      label={t.share}
      tooltip={false}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => toast(t.shared)).catch(() => undefined);
      }}
    >
      <Share2 aria-hidden="true" strokeWidth={1.75} />
    </IconButton>
  );
}
