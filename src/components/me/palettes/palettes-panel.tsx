'use client';

import { ArrowLeft, Check, CircleAlert, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/appInfo';
import { getBuiltinPalette, isBuiltinPaletteId, listBuiltinPalettes, type BuiltinPaletteId } from '@/lib/palettes';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useLoginDialog } from '@/components/shell/login-dialog';
import { relativeTime } from '@/components/create/create-model';
import { paletteSizes } from '@/components/create/palette-choices';
import { deletePalette, listPalettes, newPaletteId, savePalette, type PaletteRecord } from '@/components/palettes/api';
import { ActionMenu } from '../action-menu';
import { Banner } from '../banner';
import { ConfirmDialog } from '../confirm-dialog';
import { useMe } from '../me-context';
import { builtinCards, builtinSwatches, customSwatches, sampleStrip, type Swatch } from './palette-model';
import { FALLBACK_DEFAULT_PALETTE, useDefaultPalette } from '@/components/account/useDefaultPalette';
import { PaletteStrip, SwatchPanel } from './swatch-panel';

const s = zhCN.me.palettes;
const icon = (Icon: typeof Plus) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const cardClass = 'relative grid content-start gap-3 rounded-lg border border-line bg-bg p-3 transition-[border-color,box-shadow] duration-state ease-standard hover:border-line-strong hover:shadow-float';
const colorKey = (color: { code: string | null; hex: string }) => `${(color.code ?? '').trim().toUpperCase()}|${color.hex.slice(0, 7).toUpperCase()}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type Viewing = { kind: 'builtin'; id: BuiltinPaletteId } | { kind: 'custom'; record: PaletteRecord };

function SectionHead({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 id={id} className="text-title-2 text-ink">{title}</h2>
      <span className="flex-1" />
      {children}
    </div>
  );
}

function PaletteEditor({ record, onClose, onSaved }: { record: PaletteRecord | null; onClose: () => void; onSaved: (record: PaletteRecord) => void }) {
  const [name, setName] = useState(record?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<BuiltinPaletteId>(FALLBACK_DEFAULT_PALETTE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set((record?.colors ?? []).map(colorKey)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => builtinSwatches(baseId).filter((swatch) => !swatch.displayOnly && swatch.code), [baseId]);
  const baseKeys = useMemo(() => new Set(base.map(colorKey)), [base]);
  const extras = useMemo(() => customSwatches((record?.colors ?? []).filter((color) => !baseKeys.has(colorKey(color)))), [record, baseKeys]);
  const baseName = listBuiltinPalettes().find((item) => item.id === baseId)?.label ?? '';
  const toggle = (swatch: Swatch) => setSelected((current) => {
    const next = new Set(current);
    const key = colorKey(swatch);
    if (next.has(key)) next.delete(key);
    else if (next.size < LIMITS.customPaletteColors) next.add(key);
    return next;
  });
  const colors = [...base, ...extras].filter((swatch) => selected.has(colorKey(swatch))).map((swatch) => ({ code: swatch.code ?? '', hex: swatch.hex }));
  const save = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(s.nameRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await savePalette(record?.id ?? newPaletteId(), trimmed, colors, record?.revision ?? 0));
    } catch (caught) {
      const code = caught instanceof Error && 'code' in caught ? (caught as { code: string }).code : '';
      setError(code === 'UNAUTHORIZED' ? s.loginExpired : code === 'REVISION_CONFLICT' ? s.conflict : code === 'CONFLICT' ? s.limit : caught instanceof Error && code === 'VALIDATION' ? caught.message : s.saveFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent size="lg" className="max-md:h-sheet">
        <DialogHeader>
          <DialogTitle>{record ? s.editorEdit : s.editorNew}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid content-start gap-3">
          <Field label={s.nameLabel} error={nameError}>
            <Input autoFocus={!record} value={name} maxLength={LIMITS.designNameLength} autoComplete="off" onChange={(event) => { setName(event.target.value); setNameError(null); }} />
          </Field>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-body-sm text-ink-3">{s.baseHint(baseName, base.length)}</p>
            <Select label={s.baseLabel} size="sm" value={baseId} onValueChange={(value) => { if (isBuiltinPaletteId(value)) setBaseId(value); }} options={listBuiltinPalettes().map((item) => ({ value: item.id, label: item.label }))} />
          </div>
          <SwatchPanel
            swatches={base}
            label={s.swatchList(baseName)}
            selected={selected}
            onToggle={toggle}
            keyOf={colorKey}
            footer={extras.length ? (
              <div className="grid gap-2 rounded-md bg-bg-subtle p-3">
                <p className="text-footnote font-medium text-ink">{s.extraGroup(extras.length)}</p>
                <p className="text-caption font-normal text-ink-3">{s.extraHint}</p>
                <div className="flex flex-wrap gap-2">
                  {extras.map((swatch) => (
                    <button key={swatch.key} type="button" aria-pressed={selected.has(colorKey(swatch))} aria-label={`${swatch.code} ${swatch.name}`} onClick={() => toggle(swatch)} className="inline-flex h-8 items-center gap-2 rounded-full bg-bg pr-3 pl-1 text-caption text-ink-2 inset-ring-1 inset-ring-line focus-visible:focus-ring aria-pressed:inset-ring-2 aria-pressed:inset-ring-ink">
                      <i className="size-6 rounded-full inset-ring-1 inset-ring-ink/10" style={{ backgroundColor: swatch.hex }} />
                      <span className="font-mono">{swatch.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          />
          <FormAlert>{error}</FormAlert>
        </DialogBody>
        <DialogFooter className="items-center">
          <span className="mr-auto text-body-sm whitespace-nowrap text-ink-3 tabular-nums max-md:mr-0 max-md:flex-none">{s.picked(colors.length)}</span>
          <Button variant="secondary" disabled={busy} onClick={onClose}>{zhCN.me.cancel}</Button>
          <Button variant="primary" loading={busy} disabled={colors.length === 0} onClick={() => void save()}>{zhCN.me.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaletteViewer({ viewing, targetDesignId, defaultId, onSetDefault, onClose, onEdit }: {
  viewing: Viewing; targetDesignId: string | null; defaultId: BuiltinPaletteId;
  onSetDefault: (id: BuiltinPaletteId, name: string) => Promise<void>; onClose: () => void; onEdit: (record: PaletteRecord) => void;
}) {
  const builtin = viewing.kind === 'builtin' ? getBuiltinPalette(viewing.id) : null;
  const [settingDefault, setSettingDefault] = useState(false);
  const isDefault = builtin?.id === defaultId;
  const swatches = useMemo(() => (viewing.kind === 'builtin' ? builtinSwatches(viewing.id) : customSwatches(viewing.record.colors)), [viewing]);
  const title = builtin ? builtin.label : viewing.kind === 'custom' ? viewing.record.name : '';
  const [now] = useState(() => Date.now());
  const meta = builtin
    ? [s.viewerBuiltinMeta(builtin.engineColorCount, paletteSizes({ kind: 'builtin', brand: builtin.id }).replaceAll(' / ', '、')), isDefault ? s.viewerDefault : null, builtin.exclusions.total > 0 ? s.viewerExcluded(builtin.exclusions.total) : null].filter(Boolean).join(' · ')
    : viewing.kind === 'custom' ? s.viewerCustomMeta(viewing.record.colors.length, relativeTime(viewing.record.updatedAt, now)) : '';
  const useHref = targetDesignId ? `/app?${new URLSearchParams({ id: targetDesignId, palette: viewing.kind === 'builtin' ? `builtin:${viewing.id}` : `custom:${viewing.record.id}` })}` : null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg" className="max-md:h-sheet">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid content-start gap-3">
          <p className="text-body-sm text-ink-3">{meta}</p>
          <SwatchPanel swatches={swatches} label={s.swatchList(title)} />
          {builtin ? (
            <details className="text-body-sm text-ink-3">
              <summary className="cursor-pointer rounded-sm font-medium text-ink-2 focus-visible:focus-ring">{s.sources}</summary>
              <p className="mt-2">{builtin.source.qualityLabel} · {builtin.source.qualitySummary}</p>
              <p className="mt-1">{s.sourceLine(builtin.source.repository, builtin.source.license)}</p>
            </details>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {viewing.kind === 'custom' ? <Button onClick={() => onEdit(viewing.record)}>{icon(Pencil)}{s.editPalette}</Button> : null}
          {builtin ? (
            isDefault
              ? <Button disabled>{icon(Check)}{s.currentDefault}</Button>
              : <Button loading={settingDefault} onClick={() => { setSettingDefault(true); void onSetDefault(builtin.id, builtin.label).finally(() => setSettingDefault(false)); }}>{s.setDefault}</Button>
          ) : null}
          {useHref ? <Link href={useHref} className={buttonVariants({ variant: 'primary' })}>{s.useForDesign}</Link> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 色板（原型 renderPalettes）：「我的色板」（卡片、色带、编辑 / 复制 / 删除、新建）+「内置色板」（卡片 → 可搜索色块弹窗）。
 * mode="public" 是 /palettes 公开页：只有内置部分，未登录可看。带 ?designId= 从工作台进来时，弹窗里可「用于当前图纸」。
 */
export function PalettesPanel({ mode = 'me' }: { mode?: 'me' | 'public' }) {
  const toast = useToast();
  const login = useLoginDialog();
  const router = useRouter();
  const { viewer } = useMe();
  const showMine = mode === 'me';
  const signedIn = Boolean(viewer?.verified);
  const [records, setRecords] = useState<PaletteRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [editing, setEditing] = useState<PaletteRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PaletteRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [targetDesignId, setTargetDesignId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const cards = useMemo(() => builtinCards(), []);
  const defaultPalette = useDefaultPalette();
  // 弹窗按需挂载、关闭即卸载，Base UI 来不及归还焦点：打开时记下入口，关闭后手动还回去。
  const opener = useRef<HTMLElement | null>(null);
  const remember = () => {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[role=dialog]')) opener.current = document.activeElement;
  };
  const restore = () => window.setTimeout(() => { if (opener.current?.isConnected) opener.current.focus(); }, 0);
  const defaultName = cards.find((card) => card.id === defaultPalette.value)?.name ?? '';
  const setDefault = async (id: BuiltinPaletteId, name: string) => {
    try {
      await defaultPalette.set(id);
      setViewing(null);
      restore();
      toast(s.defaultSet(name), { icon: icon(Check) });
    } catch {
      toast(zhCN.me.actionFailed, { icon: icon(CircleAlert) });
    }
  };

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setRecords(await listPalettes());
      setNow(Date.now());
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get('designId') ?? '';
      if (UUID.test(id)) setTargetDesignId(id);
      if (showMine && signedIn) void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, showMine, signedIn]);

  const duplicate = async (record: PaletteRecord) => {
    try {
      const copy = await savePalette(newPaletteId(), s.copyName(record.name).slice(0, LIMITS.designNameLength), record.colors, 0);
      setRecords((current) => (current ? [copy, ...current] : [copy]));
      toast(s.duplicated(copy.name), { icon: icon(Copy) });
    } catch (caught) {
      toast(caught instanceof Error && 'code' in caught && (caught as { code: string }).code === 'CONFLICT' ? s.limit : zhCN.me.actionFailed, { icon: icon(CircleAlert) });
    }
  };

  let mine = null;
  if (showMine) {
    let body;
    if (!signedIn) {
      body = <div className="rounded-lg bg-bg-subtle"><EmptyState compact kind="empty" title={s.guestTitle} description={s.guestText} actions={<Button onClick={() => login?.open({ onSuccess: () => router.refresh() })}>{zhCN.me.login}</Button>} /></div>;
    } else if (loadError) {
      body = <Banner tone="warning" icon={icon(CircleAlert)} role="alert" action={<Button size="sm" onClick={() => void load()}>{zhCN.me.retry}</Button>}>{s.loadFailed}</Banner>;
    } else if (!records) {
      body = <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4"><Skeleton className="h-36 rounded-lg" /><Skeleton className="h-36 rounded-lg" /></div>;
    } else if (!records.length) {
      body = <div className="rounded-lg bg-bg-subtle"><EmptyState compact kind="empty" title={s.emptyTitle} description={s.emptyText} /></div>;
    } else {
      body = (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {records.map((record) => (
            <li key={record.id} className={cardClass}>
              <PaletteStrip colors={sampleStrip(record.colors.map((color) => color.hex))} />
              <div className="grid min-w-0 gap-1 px-1 pr-10 pb-1">
                <h3 className="truncate text-title-3 text-ink">{record.name}</h3>
                <p className="flex items-center gap-2 text-body-sm text-ink-3">
                  <span className="tabular-nums">{s.colors(record.colors.length)}</span>
                  <span aria-hidden="true" className="text-ink-4">·</span>
                  <span>{relativeTime(record.updatedAt, now)}</span>
                </p>
              </div>
              <button type="button" aria-label={s.openCustom(record.name)} onClick={() => { remember(); setViewing({ kind: 'custom', record }); }} className="absolute inset-0 z-0 rounded-lg focus-visible:focus-ring" />
              <div className="absolute right-2 bottom-3 z-1">
                <ActionMenu label={zhCN.me.more(record.name)} title={record.name} variant="default" size="sm" entries={[
                  { key: 'edit', label: s.actions.edit, icon: icon(Pencil), onSelect: () => { remember(); setEditing(record); } },
                  { key: 'duplicate', label: s.actions.duplicate, icon: icon(Copy), onSelect: () => void duplicate(record) },
                  'separator',
                  { key: 'delete', label: s.actions.delete, icon: icon(Trash2), danger: true, onSelect: () => { setDeleteError(null); setDeleting(record); } },
                ]} />
              </div>
            </li>
          ))}
        </ul>
      );
    }
    mine = (
      <section aria-labelledby="h-my-palettes">
        <SectionHead id="h-my-palettes" title={s.mineTitle}>
          {signedIn ? <Button size="sm" onClick={() => { remember(); setEditing('new'); }}>{icon(Plus)}{s.create}</Button> : null}
        </SectionHead>
        {body}
      </section>
    );
  }

  return (
    <div className="grid">
      {targetDesignId ? (
        <Banner icon={icon(Check)} action={<Link href={`/app?id=${targetDesignId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{icon(ArrowLeft)}{s.backToDesign}</Link>}>
          {s.targetText}
        </Banner>
      ) : null}
      {mine}
      <section aria-labelledby="h-builtin" className={cn(showMine && 'mt-10')}>
        <SectionHead id="h-builtin" title={s.builtinTitle}>
          <p className="text-body-sm text-ink-3 max-md:hidden">{s.defaultNote(defaultName)}</p>
        </SectionHead>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {cards.map((card) => (
            <li key={card.id} className={cardClass}>
              <PaletteStrip colors={card.strip} />
              <div className="grid min-w-0 gap-1 px-1 pb-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-title-3 text-ink">{card.name}</h3>
                  {card.id === defaultPalette.value ? <Badge>{icon(Check)}{s.defaultBadge}</Badge> : null}
                </div>
                <p className="flex items-center gap-2 text-body-sm text-ink-3">
                  <span className="tabular-nums">{s.colors(card.count)}</span>
                  {card.specs.map((spec) => <span key={spec} className="inline-flex h-5.5 items-center rounded-full px-2 text-caption text-ink-2 inset-ring-1 inset-ring-line-strong">{spec}</span>)}
                </p>
              </div>
              <button type="button" aria-label={s.openBuiltin(card.name, card.count)} onClick={() => { remember(); setViewing({ kind: 'builtin', id: card.id }); }} className="absolute inset-0 z-0 rounded-lg focus-visible:focus-ring" />
            </li>
          ))}
        </ul>
      </section>

      {viewing ? <PaletteViewer viewing={viewing} targetDesignId={targetDesignId} defaultId={defaultPalette.value} onSetDefault={setDefault} onClose={() => { setViewing(null); restore(); }} onEdit={(record) => { setViewing(null); setEditing(record); }} /> : null}
      {editing ? (
        <PaletteEditor
          record={editing === 'new' ? null : editing}
          onClose={() => { setEditing(null); restore(); }}
          onSaved={(saved) => {
            setEditing(null);
            restore();
            setRecords((current) => [saved, ...(current ?? []).filter((item) => item.id !== saved.id)]);
            toast(s.saved(saved.name));
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={s.deleteTitle}
        description={deleting ? s.deleteText(deleting.name) : ''}
        confirmLabel={s.actions.delete}
        danger
        busy={busy}
        error={deleteError}
        onConfirm={() => {
          const target = deleting;
          if (!target || busy) return;
          setBusy(true);
          void deletePalette(target.id, target.revision)
            .then(() => {
              setRecords((current) => (current ?? []).filter((item) => item.id !== target.id));
              setDeleting(null);
              toast(s.deleted(target.name), { icon: icon(Trash2) });
            })
            .catch(() => setDeleteError(zhCN.me.actionFailed))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
