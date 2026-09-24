'use client';

import { ChevronDown, ChevronUp, Eye, EyeOff, Info, Pencil, Plus, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ManagedCommunityWork } from '@/lib/community/adminQueries';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { useAdminCommand } from '@/components/admin/useAdminCommand';
import { useAdminPage } from '@/components/admin/useAdminPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormAlert } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { bulkWrite } from './bulk';
import { DataTable, TitleCell, type Column, type RowMenuEntry } from './data-table';
import { AdminDrawer, CommandAlert, ReasonDialog, Spacer, type CommandState } from './overlays';
import { Collapsible, NamedSwitch, Note, Thumb } from './parts';
import { BUILTIN_ICONS, PixelEditorDialog, TagIcon } from './tag-icon';
import { useAdminTable } from './use-admin-table';
import { AdminPageHead } from './page-head';

const t = zhCN.adminUi.tags;
const f = t.form;
const icon = (Icon: typeof Tag) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const ENDPOINT = '/api/admin/community/tags';

export interface TagRow { id: string; name: string; slug: string; sortOrder: number; icon: string | null; featured: boolean; active: boolean; mergedIntoTagId: string | null; version: number; workCount?: number; publicWorkCount?: number }

const usage = (tag: TagRow) => (tag.publicWorkCount !== undefined && tag.publicWorkCount !== (tag.workCount ?? 0) ? t.usagePublic(tag.workCount ?? 0, tag.publicWorkCount) : t.usage(tag.workCount ?? 0));
const StateBadge = ({ tag }: { tag: TagRow }) => tag.mergedIntoTagId ? <Badge dot>{t.states.merged}</Badge> : <Badge tone={tag.active ? 'success' : 'neutral'} dot>{tag.active ? t.states.on : t.states.off}</Badge>;
const PixelTile = ({ value, size = 'md' }: { value: string | null; size?: 'md' | 'lg' }) => (
  <span className={cn('grid shrink-0 place-items-center rounded-sm bg-bg-subtle', size === 'lg' ? 'size-12 rounded-md' : 'size-10')}><TagIcon value={value} /></span>
);

interface FormState { name: string; icon: string | null; sortOrder: string; featured: boolean; active: boolean; reason: string }
const formOf = (tag: TagRow | null): FormState => ({ name: tag?.name ?? '', icon: tag?.icon ?? null, sortOrder: String(tag?.sortOrder ?? 0), featured: tag?.featured ?? true, active: tag?.active ?? true, reason: '' });

function TagForm({ value, onChange, tag, errors, disabled }: { value: FormState; onChange: (next: FormState) => void; tag: TagRow | null; errors: Partial<Record<'name' | 'sortOrder' | 'reason', string>>; disabled: boolean }) {
  const [editor, setEditor] = useState(false);
  const custom = value.icon?.startsWith('px:') ?? false;
  const needsReason = Boolean(tag) && (value.name.trim() !== tag!.name || value.active !== tag!.active);
  const option = (key: string | null, label: string) => (
    <label key={key ?? 'none'} className="relative grid h-12 cursor-pointer place-items-center rounded-md bg-bg-subtle has-checked:bg-bg has-checked:inset-ring-2 has-checked:inset-ring-ink has-focus-visible:focus-ring">
      <input type="radio" name="tag-icon" className="sr-only" checked={value.icon === key} disabled={disabled} aria-label={label} onChange={() => onChange({ ...value, icon: key })} />
      {key ? <TagIcon value={key} /> : <span className="text-caption text-ink-3">{f.noIcon}</span>}
    </label>
  );
  return (
    <div className="grid gap-5">
      <Field label={f.name} hint={errors.name ? undefined : f.nameHint} error={errors.name}>
        <Input value={value.name} maxLength={30} autoComplete="off" disabled={disabled} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-footnote font-medium text-ink">{f.icon}</legend>
        <div role="radiogroup" aria-label={f.icon} className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2">
          {option(null, f.noIcon)}
          {BUILTIN_ICONS.map((key) => option(key, f.iconLabel(key)))}
          {custom ? option(value.icon, f.custom) : null}
        </div>
        <Button size="sm" variant="ghost" className="justify-self-start" disabled={disabled} onClick={() => setEditor(true)}>{icon(Pencil)}{f.editPixels}</Button>
      </fieldset>
      <Field label={f.order} hint={errors.sortOrder ? undefined : f.orderHint} error={errors.sortOrder}>
        <Input value={value.sortOrder} inputMode="numeric" disabled={disabled} className="w-32" onChange={(event) => onChange({ ...value, sortOrder: event.target.value.replace(/[^\d-]/g, '') })} />
      </Field>
      <NamedSwitch visibleLabel label={f.featured} hint={f.featuredHint} checked={value.featured} disabled={disabled} onCheckedChange={(checked) => onChange({ ...value, featured: checked })} />
      {tag ? <NamedSwitch visibleLabel label={f.active} hint={f.activeHint} checked={value.active} disabled={disabled} onCheckedChange={(checked) => onChange({ ...value, active: checked })} /> : null}
      {needsReason ? (
        <Field label={f.reason} hint={errors.reason ? undefined : f.reasonHint} error={errors.reason}>
          <Textarea rows={3} maxLength={500} value={value.reason} disabled={disabled} onChange={(event) => onChange({ ...value, reason: event.target.value })} />
        </Field>
      ) : null}
      <PixelEditorDialog open={editor} onOpenChange={setEditor} value={value.icon} onApply={(next) => onChange({ ...value, icon: next })} />
    </div>
  );
}

function validate(value: FormState, tag: TagRow | null) {
  const errors: Partial<Record<'name' | 'sortOrder' | 'reason', string>> = {};
  const name = value.name.trim();
  if (!name) errors.name = f.nameEmpty;
  if (!/^-?\d+$/.test(value.sortOrder.trim())) errors.sortOrder = f.orderInvalid;
  if (tag && (name !== tag.name || value.active !== tag.active) && value.reason.trim().length < 3) errors.reason = f.reasonMin;
  return errors;
}

function WorkPicker({ tag, onTagged }: { tag: TagRow; onTagged: () => void }) {
  const p = t.picker;
  const toast = useToast();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const list = useAdminPage<ManagedCommunityWork>(`${ENDPOINT}/${tag.id}/works?q=${encodeURIComponent(q)}&tagState=missing`, 'tag-picker');
  const command = useAdminCommand();
  useEffect(() => { const timer = window.setTimeout(() => { if (input !== q) { setQ(input); setChecked([]); } }, 200); return () => window.clearTimeout(timer); }, [input, q]);
  const picked = checked.filter((id) => list.items.some((item) => item.id === id));
  const submit = () => command.run({ url: '/api/admin/community/works/tags', method: 'POST', body: { workIds: picked, tags: [tag.name] } }, async () => {
    toast(p.done(picked.length), { icon: icon(Tag) }); setChecked([]); await list.reload(); onTagged();
  });
  return (
    <div className="grid gap-3">
      <p className="text-body-sm text-ink-3">{p.help}</p>
      <SearchField value={input} onValueChange={setInput} placeholder={p.search} aria-label={p.search} wrapperClassName="h-control-md pl-3.5" className="text-body-sm" />
      {list.error ? <FormAlert>{list.error}</FormAlert> : null}
      {!list.loading && !list.items.length ? <p className="text-body-sm text-ink-3">{p.empty}</p> : null}
      <ul role="list" className="grid">
        {list.items.map((work) => (
          <li key={work.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-bg-subtle">
              <Checkbox checked={picked.includes(work.id)} disabled={command.locked}
                onCheckedChange={(on) => setChecked(on ? (picked.length >= 50 ? picked : [...picked, work.id]) : picked.filter((id) => id !== work.id))} />
              <Thumb revisionId={work.thumbnail?.revisionId} />
              <span className="grid min-w-0"><b className="truncate text-body-sm font-semibold text-ink">{work.title ?? zhCN.adminUi.works.noTitle}</b><small className="truncate text-caption font-normal text-ink-3">{work.displayName}</small></span>
            </label>
          </li>
        ))}
      </ul>
      {list.items.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox checked={list.items.length > 0 && picked.length === Math.min(50, list.items.length)} onCheckedChange={(on) => setChecked(on ? list.items.slice(0, 50).map((item) => item.id) : [])}>{p.selectAll}</Checkbox>
          <Button size="sm" variant="primary" disabled={!picked.length || command.locked} loading={command.busy} onClick={() => void submit()}>{icon(Tag)}{p.submit(tag.name, picked.length)}</Button>
        </div>
      ) : null}
      {list.totalPages > 1 ? <Pagination variant="compact" page={list.page} pageCount={list.totalPages} total={list.total} pageSize={list.size} onPageChange={(next) => { setChecked([]); list.setPage(next); }} className="px-0" /> : null}
      <CommandAlert command={command} />
    </div>
  );
}

function MergePanel({ tag, onMerged }: { tag: TagRow; onMerged: (target: string) => void }) {
  const m = t.merge;
  const command = useAdminCommand();
  const [candidates, setCandidates] = useState<TagRow[]>([]);
  const [target, setTarget] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    fetch(`${ENDPOINT}?state=on&size=100`, { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: TagRow[] } | null) => setCandidates((body?.items ?? []).filter((item) => item.id !== tag.id))).catch(() => {});
  }, [tag.id]);
  const picked = candidates.find((item) => item.id === target);
  return (
    <div className="grid gap-3">
      <p className="text-body-sm text-ink-3">{m.help}</p>
      <Select label={m.target} placeholder={m.choose} value={target} onValueChange={(next) => { setTarget(next); setConfirmed(false); }} options={candidates.map((item) => ({ value: item.id, label: item.name }))} />
      {picked ? <Checkbox checked={confirmed} onCheckedChange={(on) => setConfirmed(Boolean(on))}>{m.check(tag.name, picked.name)}</Checkbox> : null}
      <Button variant="danger-outline" className="justify-self-start" disabled={!picked || !confirmed} onClick={() => { command.resetNotice(); setDialog(true); }}>{m.submit}</Button>
      {dialog && picked ? (
        <ReasonDialog open onOpenChange={setDialog} title={m.title} subject={m.check(tag.name, picked.name)} label={m.label} quick={[...m.quick]} confirmLabel={m.submit} command={command}
          onConfirm={(reason) => command.run({ url: `${ENDPOINT}/${tag.id}/merge`, method: 'POST', body: { targetTagId: picked.id, expectedVersion: tag.version, reason } }, () => { setDialog(false); onMerged(picked.name); })} />
      ) : null}
    </div>
  );
}

export function TagsConsole({ initialQ }: { initialQ?: string }) {
  const toast = useToast();
  const table = useAdminTable<TagRow>(ENDPOINT, 'tags', { initialQ });
  const command = useAdminCommand();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(formOf(null));
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [toggle, setToggle] = useState<TagRow | null>(null);
  const sorted = [...table.items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const open = table.items.find((item) => item.id === openId) ?? null;
  const merged = open?.mergedIntoTagId ? table.items.find((item) => item.id === open.mergedIntoTagId)?.name ?? open.mergedIntoTagId : null;

  const startCreate = () => { command.resetNotice(); setErrors({}); setForm(formOf(null)); setCreating(true); };
  const startEdit = (tag: TagRow) => { command.resetNotice(); setErrors({}); setForm(formOf(tag)); setOpenId(tag.id); };
  const save = async (tag: TagRow | null) => {
    const next = validate(form, tag);
    setErrors(next);
    if (Object.keys(next).length || command.locked) return;
    const fields = { name: form.name.trim(), sortOrder: Number(form.sortOrder), icon: form.icon, featured: form.featured };
    await command.run(tag
      ? { url: `${ENDPOINT}/${tag.id}`, method: 'PATCH', body: { ...fields, active: form.active, expectedVersion: tag.version, ...(form.reason.trim() ? { reason: form.reason.trim() } : {}) } }
      : { url: ENDPOINT, method: 'POST', body: { ...fields, expectedVersion: 0 } },
    async () => { toast(tag ? f.saved(fields.name) : f.created(fields.name), { icon: icon(Tag) }); setCreating(false); setOpenId(null); await table.reload(); });
  };
  const setFeatured = async (tag: TagRow, featured: boolean) => {
    const result = await bulkWrite([tag], () => ({ url: `${ENDPOINT}/${tag.id}`, method: 'PATCH', body: { expectedVersion: tag.version, featured } }));
    if (result.done) { toast(featured ? t.featuredOn(tag.name) : t.featuredOff(tag.name)); } else toast(zhCN.communityAdmin.command.failed);
    await table.reload();
  };
  const move = async (tag: TagRow, delta: -1 | 1) => {
    const index = sorted.indexOf(tag);
    const other = sorted[index + delta];
    if (!other) return;
    const writes = other.sortOrder === tag.sortOrder ? [[tag, other.sortOrder + delta] as const] : [[tag, other.sortOrder] as const, [other, tag.sortOrder] as const];
    await bulkWrite([...writes], ([row, order]) => ({ url: `${ENDPOINT}/${row.id}`, method: 'PATCH', body: { expectedVersion: row.version, sortOrder: order } }));
    toast(t.moved(tag.name));
    await table.reload();
  };
  const columns: Column<TagRow>[] = [
    { key: 'name', label: t.columns.name, main: true, cell: (tag) => <TitleCell lead={<PixelTile value={tag.icon} />} title={tag.name} onOpen={() => startEdit(tag)} /> },
    { key: 'works', label: t.columns.works, align: 'end', sort: (a, b) => (a.workCount ?? 0) - (b.workCount ?? 0), cell: (tag) => <span className="tabular-nums">{usage(tag)}</span> },
    { key: 'order', label: t.columns.order, align: 'end', cell: (tag) => <span className="tabular-nums">{tag.sortOrder}</span> },
    { key: 'featured', label: t.columns.featured, cell: (tag) => <NamedSwitch label={t.featuredToggle(tag.name)} checked={tag.featured} disabled={Boolean(tag.mergedIntoTagId)} onCheckedChange={(checked) => void setFeatured(tag, checked)} /> },
    { key: 'status', label: t.columns.status, cell: (tag) => <StateBadge tag={tag} /> },
  ];
  const menu = (tag: TagRow): RowMenuEntry[] => [
    { id: 'edit', label: t.menu.edit, icon: icon(Pencil), onSelect: () => startEdit(tag) },
    { id: 'up', label: t.menu.up, icon: icon(ChevronUp), disabled: sorted.indexOf(tag) <= 0, onSelect: () => void move(tag, -1) },
    { id: 'down', label: t.menu.down, icon: icon(ChevronDown), disabled: sorted.indexOf(tag) >= sorted.length - 1, onSelect: () => void move(tag, 1) },
    ...(tag.mergedIntoTagId ? [] : [{ id: 'toggle', label: tag.active ? t.menu.disable : t.menu.enable, icon: icon(tag.active ? EyeOff : Eye), onSelect: () => { command.resetNotice(); setToggle(tag); } }]),
  ];
  const idle: CommandState = command;
  return (
    <>
      <AdminPageHead section="tags" actions={<Button variant="primary" onClick={startCreate}>{icon(Plus)}{t.create}</Button>} />
      <DataTable<TagRow>
        label={t.label} rows={sorted} rowId={(tag) => tag.id} rowName={(tag) => tag.name} columns={columns} minWidth={760}
        card={(tag) => ({ lead: <PixelTile value={tag.icon} />, title: tag.name, meta: <>{usage(tag)} · {t.orderAt(tag.sortOrder)}</>, tail: <><StateBadge tag={tag} />{tag.featured ? <Badge>{t.columns.featured}</Badge> : null}</> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: t.search }}
        filters={[{ key: 'state', label: t.filters.state, options: [{ value: 'on', label: t.states.on }, { value: 'off', label: t.states.off }] }]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        menu={menu} onOpen={startEdit} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={t.emptyTitle}
      />
      <Dialog open={creating} onOpenChange={(next) => { if (!next && command.locked) return; setCreating(next); }}>
        <DialogContent aria-label={t.createTitle}>
          <DialogHeader><DialogTitle>{t.createTitle}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <TagForm value={form} onChange={setForm} tag={null} errors={errors} disabled={command.locked} />
            <CommandAlert command={idle} />
          </DialogBody>
          <DialogFooter>
            <Button disabled={command.locked} onClick={() => setCreating(false)}>{f.cancel}</Button>
            <Button variant="primary" loading={command.busy && !command.uncertain} disabled={command.locked} onClick={() => void save(null)}>{t.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next && !command.locked) setOpenId(null); }} title={open ? t.edit(open.name) : ''} badges={open ? <StateBadge tag={open} /> : null}
        footer={open && !open.mergedIntoTagId ? <>
          <Spacer />
          <Button disabled={command.locked} onClick={() => setOpenId(null)}>{f.cancel}</Button>
          <Button variant="primary" loading={command.busy && !command.uncertain} disabled={command.locked} onClick={() => void save(open)}>{f.save}</Button>
        </> : undefined}>
        {open ? <>
          <div className="flex items-center gap-3 rounded-md bg-bg-subtle p-3">
            <TagIcon value={open.icon} className="size-10" />
            <div className="grid"><b className="text-body-sm font-semibold text-ink">{open.name}</b><span className="text-body-sm text-ink-3">{usage(open)} · {t.orderAt(open.sortOrder)}</span></div>
          </div>
          {merged ? <Note icon={icon(Info)}>{t.merge.mergedInto(merged)}</Note> : <>
            <TagForm value={form} onChange={setForm} tag={open} errors={errors} disabled={command.locked} />
            <CommandAlert command={idle} />
            <Collapsible summary={t.picker.title}><WorkPicker tag={open} onTagged={() => void table.reload()} /></Collapsible>
            <Collapsible summary={t.merge.title}><MergePanel tag={open} onMerged={(target) => { toast(t.merge.done(open.name, target)); setOpenId(null); void table.reload(); }} /></Collapsible>
          </>}
        </> : null}
      </AdminDrawer>
      {toggle ? (
        <ReasonDialog open onOpenChange={(next) => { if (!next) setToggle(null); }}
          title={toggle.active ? t.disableDialog.title(toggle.name) : t.disableDialog.titleOn(toggle.name)} subject={t.disableDialog.subject} label={t.disableDialog.label}
          quick={[...t.disableDialog.quick]} confirmLabel={toggle.active ? t.disableDialog.confirm : t.disableDialog.confirmOn} tone={toggle.active ? 'danger' : 'primary'} command={command}
          onConfirm={(reason) => command.run({ url: `${ENDPOINT}/${toggle.id}`, method: 'PATCH', body: { expectedVersion: toggle.version, active: !toggle.active, reason } }, async () => {
            toast(toggle.active ? t.disableDialog.done(toggle.name) : t.disableDialog.doneOn(toggle.name)); setToggle(null); await table.reload();
          })} />
      ) : null}
    </>
  );
}
