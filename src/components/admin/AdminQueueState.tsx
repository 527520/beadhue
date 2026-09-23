import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import { zhCN } from '@/messages/zh-CN';
import { AdminEmpty, AdminSkeleton } from './AdminPrimitives';

/**
 * 队列的三种非内容态：读取失败（可重试）、读取中（骨架）、无内容（空态）。
 * admin-round-3 06：只有「本页还没有任何内容」才让骨架占位；翻页 / 换每页条数 / 重新加载时
 * 保留现有行，避免每翻一页整列表卸载重画（旧行为）。
 */
export default function AdminQueueState({ loading, error, empty, reload, children }: {
  loading: boolean; error: string | null; empty: boolean; reload: () => Promise<void>; children: ReactNode;
}) {
  const t = zhCN.communityAdmin.command;
  if (error && empty) return <div className="admin-form-stack">
    <Notice kind="danger">{error}</Notice>
    <div className="admin-form-actions"><Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>{t.reload}</Button></div>
  </div>;
  if (loading && empty) return <AdminSkeleton label={t.loading} />;
  if (empty) return <AdminEmpty icon="inbox" title={t.empty} />;
  return <>{error && <div className="admin-queue-error"><Notice kind="danger">{error}</Notice></div>}{children}</>;
}
