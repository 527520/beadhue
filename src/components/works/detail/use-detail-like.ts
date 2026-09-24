'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics/client';
import { zhCN } from '@/messages/zh-CN';
import { ensureAuthStatus } from '@/components/account/useAuthStatus';
import { useRequireLogin } from '@/components/shell/login-dialog';
import { useToast } from '@/components/ui/toast';

/**
 * 详情页的喜欢胶囊（心形 + 数字）：与卡片上的 useWorkLike 同一套规则——未登录先弹登录、成功后继续并刷新页面，
 * 乐观更新，失败回滚；数字以接口返回的 likeCount 为准。服务端给的新值（刷新后）覆盖本地状态。
 */
export function useDetailLike(workId: string, initialLiked: boolean, initialCount: number) {
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const [synced, setSynced] = useState({ liked: initialLiked, count: initialCount });
  if (synced.liked !== initialLiked || synced.count !== initialCount) {
    setSynced({ liked: initialLiked, count: initialCount });
    setState({ liked: initialLiked, count: initialCount });
  }
  const pending = useRef(false);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);
  const requireLogin = useRequireLogin();
  const router = useRouter();
  const toast = useToast();

  const toggle = useCallback(() => {
    void ensureAuthStatus().then((before) => {
      const wasGuest = before.kind !== 'user';
      requireLogin(() => {
        if (pending.current) return;
        pending.current = true;
        const previous = latest.current;
        const next = !previous.liked;
        setState({ liked: next, count: Math.max(0, previous.count + (next ? 1 : -1)) });
        void fetch(`/api/community/works/${workId}/like`, { method: next ? 'PUT' : 'DELETE', headers: { 'content-type': 'application/json' } })
          .then(async (response) => {
            const result = (await response.json().catch(() => null)) as { liked?: unknown; likeCount?: unknown } | null;
            if (!response.ok || typeof result?.liked !== 'boolean' || typeof result.likeCount !== 'number') throw new Error('like failed');
            setState({ liked: result.liked, count: result.likeCount });
            track({ name: 'community_like_changed', properties: { action: result.liked ? 'added' : 'removed' } });
          })
          .catch(() => {
            setState(previous);
            toast(zhCN.discover.likeFailed);
          })
          .finally(() => {
            pending.current = false;
            if (wasGuest) router.refresh();
          });
      });
    });
  }, [requireLogin, router, toast, workId]);

  return { ...state, toggle };
}
