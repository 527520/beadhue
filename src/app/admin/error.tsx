'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/field';
import { AdminCard } from '@/components/admin-ui/parts';
import { zhCN } from '@/messages/zh-CN';

/**
 * 后台错误边界（用户第 15 条）：既给用户一个可重试的界面，也把这次失败上报到运行日志。
 *
 * 上报只发四个字段（message / digest / path / stack），掩码 IP 与 requestId 由服务端补齐；
 * 上报本身失败不影响页面，也不重试——错误边界再抛错只会让用户看到白屏。
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = zhCN.communityAdmin.readError;
  useEffect(() => {
    void fetch('/api/internal/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: (error.message || t.reportFallback).slice(0, 1000),
        digest: error.digest?.slice(0, 120),
        path: window.location.pathname.slice(0, 300),
        stack: error.stack?.slice(0, 16_000),
      }),
    }).catch(() => {});
  }, [error, t.reportFallback]);
  // 渲染在后台外壳的 <main> 里，这里不再写 main。
  return (
    <AdminCard className="grid max-w-prose justify-items-start gap-3 p-6">
      <h1 className="text-title-2 text-ink">{t.title}</h1>
      <FormAlert>{t.body}</FormAlert>
      <div className="flex gap-2"><Button nativeButton={false} render={<Link href="/admin" />}>{t.back}</Button><Button variant="primary" onClick={reset}>{t.retry}</Button></div>
    </AdminCard>
  );
}
