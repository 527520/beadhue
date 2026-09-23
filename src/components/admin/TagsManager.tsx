'use client';
import ResponsiveSelect from '@/components/legacy-ui/ResponsiveSelect';
import Switch from '@/components/legacy-ui/Switch';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { zhCN } from '@/messages/zh-CN';
import AdminCommandNotice from './AdminCommandNotice';
import AdminQueueState from './AdminQueueState';
import { AdminEmpty, AdminPagination, FilterBar, ReasonPanel } from './AdminPrimitives';
import Button from '@/components/legacy-ui/Button';
import Checkbox from '@/components/legacy-ui/Checkbox';
import Disclosure from '@/components/legacy-ui/Disclosure';
import TextField from '@/components/legacy-ui/TextField';
import NumberField from '@/components/legacy-ui/NumberField';
import Badge from '@/components/legacy-ui/Badge';
import { useAdminPage } from './useAdminPage';
import TagWorkPicker from './TagWorkPicker';
import { useAdminCommand } from './useAdminCommand';
import { useAdminTaskFocus } from './useAdminTaskFocus';

interface Tag { id: string; name: string; slug: string; sortOrder: number; active: boolean; mergedIntoTagId: string | null; version: number; workCount?: number; publicWorkCount?: number }

/** 标签维护台（admin-round-3 08）：更名、排序、停用、合并，以及按标签批量选作品打标。 */
export default function TagsManager() {
  const t = zhCN.communityAdmin.tags;
  const c = zhCN.communityAdmin.command;
  // 标签多起来以后（用户提的正是这个场景）默认每页 10 条根本翻不动，所以这里带一个关键词搜索。
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const queue = useAdminPage<Tag>(`/api/admin/community/tags?q=${encodeURIComponent(search)}`, 'tags');
  const command = useAdminCommand();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = queue.items.find((tag) => tag.id === selectedId) ?? null;
  const creating = selectedId === 'new';
  const inspecting = creating || selected !== null;
  const { queueRef, detailRef } = useAdminTaskFocus(inspecting ? selectedId : null);
  const [name, setName] = useState('');
  const [order, setOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  /**
   * 合并候选独立于列表当前页与搜索词：列表分页后「只能合并到本页可见的标签」是错的，
   * 这里直接取最多 100 个启用且未合并的标签。
   */
  const [mergeCandidates, setMergeCandidates] = useState<Tag[]>([]);
  const loadMergeCandidates = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/community/tags?size=100', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json() as { items?: Tag[] };
      setMergeCandidates((body.items ?? []).filter((tag) => tag.active && !tag.mergedIntoTagId));
    } catch { /* 读取失败就保持上一次的候选，不影响其余操作 */ }
  }, []);
  // 与 useAdminPage / useAdminInspection 同一写法：把读取放进宏任务，避免在 effect 同步写 state。
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMergeCandidates(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMergeCandidates]);
  const target = mergeCandidates.find((tag) => tag.id === mergeTarget);
  const editable = !command.locked && !queue.loading && !queue.error && !selected?.mergedIntoTagId;
  const validReason = reason.trim().length >= 3;
  // 新建标签不要求操作理由（用户口径）；改名/停用/合并仍需要，因为会改变已有作品的展示。
  const reasonOk = creating || validReason;
  const validFields = name.trim().length > 0 && name.trim().length <= 30
    && order.trim() !== '' && Number.isInteger(Number(order)) && Number(order) >= -2147483648 && Number(order) <= 2147483647;
  const changed = creating || (selected && (name.trim() !== selected.name || Number(order) !== selected.sortOrder || active !== selected.active));
  const select = (tag: Tag | 'new' | null) => {
    if (command.locked) return;
    const item = typeof tag === 'object' ? tag : null;
    setSelectedId(tag === 'new' ? 'new' : item?.id ?? null);
    setName(item?.name ?? ''); setOrder(String(item?.sortOrder ?? 0));
    setActive(item?.active ?? true); setReason(''); setMergeTarget(''); setMergeConfirmed(false); command.resetNotice();
  };
  const completed = async () => { setSelectedId(null); setReason(''); await queue.reload(); await loadMergeCandidates(); };
  const save = async () => {
    if (!editable || !reasonOk || !validFields || !changed) return;
    const fields = { name: name.trim(), sortOrder: Number(order), reason };
    await command.run(creating
      ? { url: '/api/admin/community/tags', method: 'POST', body: { ...fields, expectedVersion: 0 } }
      : { url: `/api/admin/community/tags/${selected!.id}`, method: 'PATCH', body: { ...fields, active, expectedVersion: selected!.version } }, completed);
  };
  const merge = async () => {
    if (!selected || !target || !editable || !validReason || !mergeConfirmed) return;
    await command.run({ url: `/api/admin/community/tags/${selected.id}/merge`, method: 'POST',
      body: { targetTagId: target.id, expectedVersion: selected.version, reason } }, completed);
  };
  const canCreate = !command.locked && !queue.loading && !queue.error;
  const createButton = <Button variant="primary" size="sm" icon="plus" disabled={!canCreate} onClick={() => select('new')}>{t.create}</Button>;
  // 件数取服务端真实聚合（此前相关子查询被 drizzle 渲染成 cwt.tag_id = cwt.id，恒为 0）。
  const usageLabel = (tag: Tag) => tag.publicWorkCount !== undefined && tag.publicWorkCount !== (tag.workCount ?? 0)
    ? t.usageSplit(tag.workCount ?? 0, tag.publicWorkCount)
    : t.usage(tag.workCount ?? 0);
  // 结果反馈紧挨着动作：有选中项时在表单底部，处理完毕（选中项清空）后落在详情面板顶部。
  const notice = <AdminCommandNotice command={command} onRefresh={() => void queue.reload()} />;
  return <div className={`admin-task-layout${inspecting ? ' is-inspecting' : ''}`}>
    <section className="admin-panel admin-task-queue" tabIndex={-1} ref={queueRef} aria-label={t.title}>
      <header><h2>{t.title}</h2><span>{zhCN.communityAdmin.pagination.totalCount(queue.total)}</span>{!creating && createButton}</header>
      <FilterBar submitLabel={t.search} disabled={command.locked || queue.loading} onSubmit={(event) => {
        event.preventDefault(); select(null);
        const unchanged = q.trim() === search;
        setSearch(q.trim());
        if (unchanged && queue.page === 1) void queue.reload(); else queue.setPage(1);
      }}>
        <TextField label={t.searchLabel} value={q} maxLength={60} disabled={command.locked} onChange={(event) => setQ(event.target.value)} />
      </FilterBar>
      <p className="admin-help admin-queue-help">{t.quickHelp}</p>
      <AdminQueueState {...queue} empty={queue.items.length === 0}>
        <ul className="admin-object-list stagger">{queue.items.map((tag, index) => <li key={tag.id} style={{ '--i': index } as CSSProperties}><button type="button" disabled={command.locked} aria-current={selected?.id === tag.id} onClick={() => select(tag)}>
          <strong>{tag.name}</strong><span>{tag.mergedIntoTagId ? <Badge tone="neutral">{t.mergedState}</Badge> : <Badge tone={tag.active ? 'ok' : 'warn'}>{tag.active ? t.enabled : t.disabled}</Badge>}<small>{usageLabel(tag)} · {t.sort} {tag.sortOrder}</small></span>
        </button></li>)}</ul>
      </AdminQueueState>
      <AdminPagination page={queue.page} totalPages={queue.totalPages} size={queue.size} total={queue.total}
        onPage={(next) => { if (!command.locked) { select(null); queue.setPage(next); } }}
        onSize={(next) => { if (!command.locked) { select(null); queue.setSize(next); } }}
        disabled={command.locked || queue.loading} />
    </section>
    <section className="admin-panel admin-task-detail" tabIndex={-1} ref={detailRef} aria-label={t.action}>
      <header><h2>{t.action}</h2></header>
      {inspecting ? <div className="admin-form-stack animate-rise">
        <Button variant="quiet" size="sm" icon="chevron-left" className="admin-back-to-queue" disabled={command.locked} onClick={() => select(null)}>{c.back}</Button>
        <h2>{creating ? t.createTitle : selected!.name}</h2>
        {selected?.mergedIntoTagId ? <p>{t.mergedTo} {queue.items.find((tag) => tag.id === selected.mergedIntoTagId)?.name ?? selected.mergedIntoTagId}</p> : <>
          {/* 名称与排序要底边对齐：TextField 的说明文字会多占一行，所以帮助文字移到行外，两列等高。 */}
          <div className="form-row tag-fields">
            <TextField label={t.name} value={name} maxLength={30} disabled={!editable} onChange={(event) => setName(event.target.value)} />
            <NumberField label={t.sort} value={order.trim() === '' ? undefined : Number(order)} disabled={!editable} onValueChange={(value) => setOrder(value === undefined ? '' : String(value))} />
          </div>
          <p className="admin-help">{t.slugHelp}</p>
          {!creating && <Switch label={t.enabled} checked={active} disabled={!editable} onChange={setActive} />}
          <ReasonPanel reason={reason} onReasonChange={setReason} disabled={command.locked}
            hint={creating ? t.createNoReason : undefined}>
            <Button variant="primary" icon={creating ? 'plus' : 'check'} disabled={!editable || !validFields || !reasonOk || !changed} loading={command.busy && !mergeConfirmed} onClick={() => void save()}>{creating ? t.create : c.save}</Button>
          </ReasonPanel>
          {selected && <Disclosure compact icon="tag" summary={t.pickWorks}>{<TagWorkPicker tag={{ id: selected.id, name: selected.name }} onTagged={() => queue.reload()} />}</Disclosure>}
          {selected && <Disclosure compact icon="copy" summary={t.merge}><div className="admin-subsection">
            <p className="admin-help">{t.mergeHelp}</p>
            <ResponsiveSelect label={t.mergeTarget} value={mergeTarget} disabled={!editable} onValueChange={value=>{setMergeTarget(value);setMergeConfirmed(false);}} options={[{value:'',label:t.chooseTarget},...mergeCandidates.filter(tag=>tag.id!==selected.id).map(tag=>({value:tag.id,label:tag.name}))]} />
            {target && <Checkbox label={t.confirmMerge(selected.name, target.name)} checked={mergeConfirmed} disabled={!editable} onChange={setMergeConfirmed} />}
            <div className="admin-form-actions"><Button variant="danger" icon="copy" disabled={!editable || !target || !mergeConfirmed || !validReason} loading={command.busy && mergeConfirmed} onClick={() => void merge()}>{t.mergeSubmit}</Button></div>
          </div></Disclosure>}
        </>}
        {notice}
      </div> : <div className="admin-form-stack">{notice}<AdminEmpty icon="tag" title={c.select} /></div>}
    </section>
    {inspecting && queue.error && <div className="admin-task-notice"><AdminQueueState {...queue} empty={false}>{null}</AdminQueueState></div>}
  </div>;
}
