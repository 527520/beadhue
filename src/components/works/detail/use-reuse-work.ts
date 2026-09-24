'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { track } from '@/lib/analytics/client';
import { randomId } from '@/lib/ids';
import { zhCN } from '@/messages/zh-CN';
import { useToast } from '@/components/ui/toast';

const t = zhCN.detail;
/** 原图交接是锦上添花：超时就放弃，不能拖住打开副本。 */
const ORIGINAL_HANDOFF_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? t.makeFailed;
}

/**
 * 「用这张制作」的引用流程（沿用旧豆社页）：创建云端私人副本（幂等键，重试不重复创建）→ 拉到本机 →
 * 交接作者原图（D49，取不到只失去再调参能力）→ 进入编辑器。同步与存储模块按需加载，不进首屏包。
 */
export function useReuseWork(workId: string) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const created = useRef<{ designId: string; revisionId: string | null; originalAvailable: boolean } | null>(null);
  const busy = useRef(false);

  const reuse = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    let navigating = false;
    try {
      if (!created.current) {
        key.current ??= randomId();
        const response = await fetch(`/api/community/works/${workId}/reuse`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key.current } });
        if (!response.ok) throw new Error(await errorMessage(response));
        const body = (await response.json()) as { designId?: unknown; revisionId?: unknown; originalAvailable?: unknown };
        if (typeof body.designId !== 'string' || !/^[a-f0-9-]{36}$/iu.test(body.designId)) throw new Error(t.makeFailed);
        created.current = { designId: body.designId, revisionId: typeof body.revisionId === 'string' ? body.revisionId : null, originalAvailable: body.originalAvailable === true };
        track({ name: 'community_reuse_succeeded', properties: {} });
      }
      const copy = created.current;
      try {
        const [{ openIndexedDb, parseStoredProject }, { createBeadhueApi }, { createSyncClient }, { withDesignStorageLock }] = await Promise.all([
          import('@/lib/storage'), import('@/lib/sync/api'), import('@/lib/sync/clientAdapter'), import('@/lib/sync/queue'),
        ]);
        const storage = await openIndexedDb();
        const client = createSyncClient(storage, createBeadhueApi());
        await withDesignStorageLock(async () => {
          if (!(await storage.getAll()).some((record) => record.id === copy.designId)) await client.pullDesign(copy.designId);
          const local = (await storage.getAll()).find((record) => record.id === copy.designId);
          if (!local || !parseStoredProject(local.projectJson)) throw new Error('copy not available locally');
        });
        if (copy.revisionId) {
          const [{ fetchRevisionOriginal }, { putPendingOriginal, rememberOriginalSource }] = await Promise.all([
            import('@/lib/community/originalsClient'), import('@/lib/storage/pendingOriginals'),
          ]);
          let handed = false;
          if (copy.originalAvailable) {
            try {
              const original = await withTimeout(fetchRevisionOriginal(copy.revisionId), ORIGINAL_HANDOFF_TIMEOUT_MS);
              if (original) {
                await putPendingOriginal({ designId: copy.designId, bytes: original.bytes.buffer as ArrayBuffer, type: original.type, name: `${workId}.${original.type}`, sourceRevisionId: copy.revisionId });
                handed = true;
              }
            } catch {
              // 原图缺失或超时：编辑器仍可打开副本，并保留「从豆社取回原图」入口。
            }
          }
          if (!handed) await rememberOriginalSource(copy.designId, copy.revisionId);
        }
      } catch {
        throw new Error(t.copyKept);
      }
      toast(t.makeCopied);
      navigating = true;
      router.push(`/app?id=${encodeURIComponent(copy.designId)}&mode=edit`);
    } catch (reason) {
      // 网络失败是 TypeError（浏览器英文消息），其余是接口或本流程给出的中文说明。
      setError(reason instanceof Error && !(reason instanceof TypeError) && reason.message ? reason.message : t.makeFailed);
    } finally {
      if (!navigating) {
        busy.current = false;
        setPending(false);
      }
    }
  }, [router, toast, workId]);

  return { reuse, pending, error, reset: () => setError(null) };
}
