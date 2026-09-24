'use client';

import { Link2, Share2 } from 'lucide-react';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { copyText } from '@/components/works/detail/work-actions';

const t = zhCN.detail.author;

function useShare() {
  const toast = useToast();
  return () => void copyText(window.location.href.split('?')[0]).then((ok) => toast(ok ? t.shared : zhCN.detail.copyFailed, { icon: <Link2 aria-hidden="true" strokeWidth={1.75} /> }));
}

/** 复制作者主页链接：桌面为头部次按钮，手机为顶栏右侧图标。 */
export function ShareProfileButton({ variant = 'icon' }: { variant?: 'icon' | 'button' }) {
  const share = useShare();
  if (variant === 'button') {
    return (
      <Button variant="secondary" onClick={share}>
        <Share2 aria-hidden="true" strokeWidth={1.75} />
        {t.share}
      </Button>
    );
  }
  return (
    <IconButton label={t.shareProfile} tooltip={false} onClick={share}>
      <Share2 aria-hidden="true" strokeWidth={1.75} />
    </IconButton>
  );
}
