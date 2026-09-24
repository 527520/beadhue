'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { ensureAuthStatus } from '@/components/account/useAuthStatus';
import { useRequireLogin } from '@/components/shell/login-dialog';
import { useToast } from '@/components/ui/toast';

/**
 * 卡片上的喜欢：未登录先弹登录，登录成功后继续这次喜欢并刷新页面（其他卡片按新登录态重渲染）；
 * 乐观更新，失败回滚并提示。服务端给的新状态（刷新后）覆盖本地状态。
 */
export function useWorkLike(workId: string, initialLiked: boolean) {
  const [liked, setLiked] = useState(initialLiked);
  const pending = useRef(false);
  const requireLogin = useRequireLogin();
  const router = useRouter();
  const toast = useToast();

  const [synced, setSynced] = useState(initialLiked);
  if (synced !== initialLiked) {
    setSynced(initialLiked);
    setLiked(initialLiked);
  }

  const toggle = useCallback((next: boolean) => {
    void ensureAuthStatus().then((before) => {
      const wasGuest = before.kind !== 'user';
      requireLogin(() => {
        if (pending.current) return;
        pending.current = true;
        setLiked(next);
        void fetch(`/api/community/works/${workId}/like`, { method: next ? 'PUT' : 'DELETE', headers: { 'content-type': 'application/json' } })
          .then(async (response) => {
            const result = (await response.json().catch(() => null)) as { liked?: unknown } | null;
            if (!response.ok || typeof result?.liked !== 'boolean') throw new Error('like failed');
            setLiked(result.liked);
          })
          .catch(() => {
            setLiked(!next);
            toast(zhCN.discover.likeFailed);
          })
          .finally(() => {
            pending.current = false;
            if (wasGuest) router.refresh();
          });
      });
    });
  }, [requireLogin, router, toast, workId]);

  return { liked, toggle };
}
