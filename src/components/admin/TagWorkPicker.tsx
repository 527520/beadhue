'use client';

/**
 * 标签管理的批量打标选择器（admin-round-3 08）。
 *
 * 用户口径：能从标签出发，「针对某个标签批量选择作品打标签」，
 * 并且**排除掉已经打过该标签的作品**、**能看到作品图**。
 * 所以这里默认请求 `tagState=missing`，行内直接给服务端带格线缩略图（管理端路径，不吃公开配额）。
 * 提交走既有的批量打标接口（服务端本身也会跳过已有标签），成功后只刷新标签计数，不动作品列表。
 */
import { useState, type CSSProperties } from 'react';
import CommunityThumbnail from '@/components/community/CommunityThumbnail';
import type { ManagedCommunityWork } from '@/lib/community/adminQueries';
import { zhCN } from '@/messages/zh-CN';
import Button from '@/components/legacy-ui/Button';
import Checkbox from '@/components/legacy-ui/Checkbox';
import Notice from '@/components/legacy-ui/Notice';
import TextField from '@/components/legacy-ui/TextField';
import { AdminEmpty, AdminPagination, AdminSkeleton } from './AdminPrimitives';
import { useAdminCommand } from './useAdminCommand';
import { useAdminPage } from './useAdminPage';

const MAX_BATCH = 50;

export default function TagWorkPicker({ tag, onTagged }: { tag: { id: string; name: string }; onTagged: () => void | Promise<void> }) {
  const t = zhCN.communityAdmin.tags;
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const queue = useAdminPage<ManagedCommunityWork>(`/api/admin/community/tags/${tag.id}/works?q=${encodeURIComponent(search)}&tagState=missing`, 'tags');
  const command = useAdminCommand();
  const selected = checked.filter((id) => queue.items.some((item) => item.id === id));
  const allChecked = queue.items.length > 0 && selected.length === queue.items.length;
  const submit = async () => {
    if (command.locked || selected.length === 0) return;
    const count = selected.length;
    await command.run(
      { url: '/api/admin/community/works/tags', method: 'POST', body: { workIds: selected, tags: [tag.name] } },
      async () => { setChecked([]); setDone(count); await queue.reload(); await onTagged(); },
    );
  };
  return <div className="admin-subsection tag-picker">
    <p className="admin-help">{t.pickWorksHelp}</p>
    <form className="admin-picker-search" onSubmit={(event) => { event.preventDefault(); setChecked([]); setSearch(q.trim()); }}>
      <TextField label={t.pickWorksSearch} value={q} maxLength={80} disabled={command.locked} onChange={(event) => setQ(event.target.value)} />
      <Button type="submit" variant="secondary" size="sm" icon="search" disabled={command.locked || queue.loading}>{zhCN.communityAdmin.works.query}</Button>
    </form>
    {command.error && <Notice kind="danger">{command.error}</Notice>}
    {done !== null && <Notice kind="info" role="status">{t.pickWorksDone(done)}</Notice>}
    {queue.error && <Notice kind="danger">{queue.error}</Notice>}
    {queue.loading && queue.items.length === 0 && <AdminSkeleton label={zhCN.communityAdmin.command.loading} rows={2} />}
    {!queue.loading && !queue.error && queue.items.length === 0 && <AdminEmpty icon="tag" title={t.pickWorksEmpty} />}
    {queue.items.length > 0 && <ul className="admin-object-list stagger">{queue.items.map((work, index) => <li key={work.id} style={{ '--i': index } as CSSProperties}>
      {/* 勾选框自带 label：把缩略图与标题放进 label 内容里，整行可点且读屏名就是作品名（不嵌套 label）。 */}
      <Checkbox compact className="admin-pick-row" checked={selected.includes(work.id)} disabled={command.locked}
        label={<span className="admin-pick-main">
          {work.thumbnail && <CommunityThumbnail scope="admin" revisionId={work.thumbnail.revisionId} width={work.thumbnail.width} height={work.thumbnail.height} label={work.title ?? zhCN.communityAdmin.works.noTitle} />}
          <span className="admin-pick-body"><strong>{work.title ?? zhCN.communityAdmin.works.noTitle}</strong><small>{work.displayName}</small></span>
        </span>}
        onChange={(next) => setChecked((current) => next
          ? (current.length >= MAX_BATCH ? current : [...current, work.id])
          : current.filter((id) => id !== work.id))} />
    </li>)}</ul>}
    {queue.items.length > 0 && <div className="admin-form-actions">
      <Checkbox compact label={<>{allChecked ? zhCN.communityAdmin.works.clearSelection : zhCN.communityAdmin.works.selectAll}{selected.length > 0 && <span className="admin-batch-count">{t.pickWorksSelected(selected.length)}</span>}</>}
        checked={allChecked} disabled={command.locked}
        onChange={(next) => setChecked(next ? queue.items.slice(0, MAX_BATCH).map((item) => item.id) : [])} />
      <Button variant="primary" size="sm" icon="tag" disabled={command.locked || selected.length === 0} loading={command.busy} onClick={() => void submit()}>{t.pickWorksSubmit(tag.name, selected.length)}</Button>
    </div>}
    {queue.total > queue.size && <AdminPagination page={queue.page} totalPages={queue.totalPages} size={queue.size} total={queue.total}
      onPage={(next) => { setChecked([]); queue.setPage(next); }} onSize={(next) => { setChecked([]); queue.setSize(next); }} disabled={command.locked || queue.loading} />}
  </div>;
}
