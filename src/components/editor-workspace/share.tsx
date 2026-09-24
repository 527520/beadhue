'use client';

/**
 * 分享（D38 只读链接 + D72 公开状态）：只读链接弹窗（生成快照链接、自动复制、二维码、停止分享），
 * 以及这张设计在豆社的公开状态（审核中 / 已公开 → 分享菜单里给出对应入口）。
 */
import { Copy, Link as LinkIcon } from 'lucide-react';
import { encodeQR } from 'qr';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics/client';
import { zhCN } from '@/messages/zh-CN';

export type CommunityStatus = { kind: 'unknown' } | { kind: 'none' } | { kind: 'pending'; workId: string } | { kind: 'published'; workId: string };

interface MineWork {
  id: string;
  lifecycleStatus: string;
  currentPublishedRevisionId: string | null;
  revisions: Array<{ sourceDesignId: string | null; status: string }>;
}

/** 从「我的公开作品」里找这张设计投过的作品（登录后才查；失败当作没有）。 */
export function useCommunityStatus(designId: string, enabled: boolean, refreshKey: number): CommunityStatus {
  const [status, setStatus] = useState<{ key: string; value: CommunityStatus }>({ key: '', value: { kind: 'unknown' } });
  const key = `${designId}:${refreshKey}`;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch('/api/community/works/mine', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: MineWork[] } | null) => {
        if (cancelled) return;
        const works = (body?.items ?? []).filter((work) => work.lifecycleStatus === 'active' && work.revisions.some((revision) => revision.sourceDesignId === designId));
        const published = works.find((work) => work.currentPublishedRevisionId);
        const pending = works.find((work) => work.revisions.some((revision) => revision.sourceDesignId === designId && (revision.status === 'pending_review' || revision.status === 'draft')));
        setStatus({ key, value: published ? { kind: 'published', workId: published.id } : pending ? { kind: 'pending', workId: pending.id } : { kind: 'none' } });
      })
      .catch(() => { if (!cancelled) setStatus({ key, value: { kind: 'none' } }); });
    return () => { cancelled = true; };
  }, [designId, enabled, key]);
  return enabled && status.key === key ? status.value : { kind: enabled ? 'unknown' : 'none' };
}

type LinkState = { kind: 'creating' } | { kind: 'ready'; url: string; svg: string } | { kind: 'failed'; message: string };

export function ShareLinkDialog({ open, onOpenChange, designId, prepare }: { open: boolean; onOpenChange: (open: boolean) => void; designId: string; prepare: () => Promise<boolean> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ShareLinkBody designId={designId} prepare={prepare} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ShareLinkBody({ designId, prepare, onClose }: { designId: string; prepare: () => Promise<boolean>; onClose: () => void }) {
  const t = zhCN.editorWorkspace.shareDialog;
  const toast = useToast();
  const [state, setState] = useState<LinkState>({ kind: 'creating' });
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const create = useCallback(async () => {
    setState({ kind: 'creating' });
    try {
      // 只读页由服务端渲染快照：先确保这张设计真的推到了云端。
      if (!(await prepare())) {
        setState({ kind: 'failed', message: zhCN.share.notSyncedYet });
        return;
      }
      const response = await fetch(`/api/designs/${designId}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        setState({ kind: 'failed', message: body?.error?.code === 'NOT_FOUND' ? zhCN.share.notSyncedYet : body?.error?.message ?? zhCN.share.createFailed });
        return;
      }
      const body = (await response.json()) as { path: string };
      const url = new URL(body.path, window.location.origin).toString();
      setState({ kind: 'ready', url, svg: encodeQR(url, 'svg', { ecc: 'medium', border: 2 }) });
      track({ name: 'share_created', properties: {} });
      if (await copyText(url)) toast(t.copied, { icon: <LinkIcon aria-hidden="true" strokeWidth={1.75} /> });
    } catch {
      setState({ kind: 'failed', message: zhCN.share.createFailed });
    }
  }, [designId, prepare, t.copied, toast]);

  useEffect(() => {
    // 打开即生成一次；只在挂载时执行。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开弹窗就是一次「生成链接」的用户操作。
    void create();
  }, [create]);

  const stop = async () => {
    setStopping(true);
    setStopError(null);
    try {
      const response = await fetch(`/api/designs/${designId}/share`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(String(response.status));
      track({ name: 'share_revoked', properties: {} });
      toast(t.stopped);
      onClose();
    } catch {
      setStopError(zhCN.share.stopFailed);
    } finally {
      setStopping(false);
    }
  };

  return (
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {state.kind === 'creating' ? <p role="status" className="text-body-sm text-ink-3">{t.creating}</p> : null}
        {state.kind === 'failed' ? <FormAlert>{state.message}</FormAlert> : null}
        {state.kind === 'ready' ? (
          <>
            <div className="flex items-center gap-2">
              <Input readOnly value={state.url} aria-label={t.linkLabel} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 font-mono text-body-sm" />
              <Button onClick={() => void copyText(state.url).then((ok) => { if (ok) toast(t.copied, { icon: <Copy aria-hidden="true" strokeWidth={1.75} /> }); })}>
                <Copy aria-hidden="true" strokeWidth={1.75} />
                {t.copy}
              </Button>
            </div>
            <div
              role="img"
              aria-label={t.qr}
              className="mx-auto size-40 [&>svg]:size-full"
              // 二维码由本地库生成的静态 SVG，不含用户输入。
              dangerouslySetInnerHTML={{ __html: state.svg }}
            />
            <p className="text-caption font-normal text-ink-3">{t.note}</p>
          </>
        ) : null}
        {stopError ? <FormAlert>{stopError}</FormAlert> : null}
      </DialogBody>
      <DialogFooter className="justify-between">
        {state.kind === 'ready' ? <Button variant="danger-ghost" loading={stopping} onClick={() => void stop()}>{t.stop}</Button> : <span />}
        <Button variant="primary" onClick={onClose}>{t.done}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
