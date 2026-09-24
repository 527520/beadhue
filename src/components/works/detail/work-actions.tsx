'use client';

import { Ellipsis, Flag, Image as ImageIcon, Link2, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { ensureAuthStatus, useAuthStatus } from '@/components/account/useAuthStatus';
import { useRequireLogin } from '@/components/shell/login-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from './action-menu';
import { ReportDialog, type ReportTarget } from './report-dialog';

const t = zhCN.detail;
const iconProps = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

export interface ShareWork {
  id: string;
  title: string;
  authorName: string;
  authorId: string;
  width: number;
  height: number;
  colorCount: number;
  beadCount: number;
  pattern: Pattern | null;
  largeImageUrl: string;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

function useCopyLink(workId: string) {
  const toast = useToast();
  return () => void copyText(`${window.location.origin}/community/${workId}`).then((ok) => toast(ok ? t.linkCopied : t.copyFailed));
}

/** 分享：复制链接、保存分享图（桌面菜单 / 手机底部面板）。 */
export function ShareMenu({ work, size }: { work: ShareWork; size?: 'md' }) {
  const toast = useToast();
  const copyLink = useCopyLink(work.id);
  const poster = async () => {
    try {
      const { savePoster } = await import('./work-files');
      await savePoster({
        title: work.title,
        meta: t.posterMeta(work.authorName, work.width, work.height, work.colorCount, work.beadCount),
        brand: zhCN.shell.brandName,
        brandTag: t.posterBrandTag,
        width: work.width,
        height: work.height,
        pattern: work.pattern,
        imageSrc: work.largeImageUrl,
      }, t.posterFile(work.title));
      toast(t.posterSaved, { icon: <ImageIcon {...iconProps} /> });
    } catch {
      toast(t.posterFailed);
    }
  };
  return (
    <ActionMenu
      title={t.share}
      trigger={<IconButton size={size} label={t.share} aria-haspopup="menu"><Share2 {...iconProps} /></IconButton>}
      items={[
        { id: 'copy', label: t.copyLink, icon: <Link2 {...iconProps} />, onSelect: copyLink },
        { id: 'poster', label: t.savePoster, icon: <ImageIcon {...iconProps} />, onSelect: () => void poster() },
      ]}
    />
  );
}

/** 更多：他人作品为「举报…」，自己的作品只有复制链接；手机顶栏的更多同时带复制链接。 */
export function MoreMenu({ work, withCopy = false }: { work: ShareWork; withCopy?: boolean }) {
  const auth = useAuthStatus();
  const router = useRouter();
  const requireLogin = useRequireLogin();
  const copyLink = useCopyLink(work.id);
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const own = auth.kind === 'user' && auth.publicAuthorId !== null && auth.publicAuthorId === work.authorId;
  const report = () => {
    void ensureAuthStatus().then((before) => {
      requireLogin(() => {
        if (before.kind !== 'user') router.refresh();
        setTarget({ targetType: 'work', targetId: work.id });
      });
    });
  };
  const items = [
    ...(withCopy || own ? [{ id: 'copy', label: t.copyLink, icon: <Link2 {...iconProps} />, onSelect: copyLink }] : []),
    ...(own ? [] : [{ id: 'report', label: t.report, icon: <Flag {...iconProps} />, onSelect: report }]),
  ];
  return (
    <>
      <ActionMenu title={t.more} trigger={<IconButton label={t.more} tooltip={t.moreTip} aria-haspopup="menu"><Ellipsis {...iconProps} /></IconButton>} items={items} />
      <ReportDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
