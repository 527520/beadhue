'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminCard } from '@/components/admin-ui/parts';
import { reportClientError } from '@/components/pages/report-client-error';
import { zhCN } from '@/messages/zh-CN';

/**
 * 后台错误边界（用户第 15 条）：既给用户一个可重试的界面，也把这次失败上报到运行日志。
 * 与站点错误页同一形态（豆粒插画 + 说明 + 唯一主按钮「重新读取页面」）。
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = zhCN.communityAdmin.readError;
  useEffect(() => {
    reportClientError(error, t.reportFallback);
  }, [error, t.reportFallback]);
  // 渲染在后台外壳的 <main> 里，这里不再写 main。
  return (
    <AdminCard className="grid place-items-center">
      <EmptyState
        page
        kind="broken"
        title={t.title}
        description={t.body}
        actions={<><Button nativeButton={false} render={<Link href="/admin" />}>{t.back}</Button><Button variant="primary" onClick={() => retry()}>{t.retry}</Button></>}
      />
    </AdminCard>
  );
}
