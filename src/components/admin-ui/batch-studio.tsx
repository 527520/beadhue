'use client';

import { Check, ChevronDown, Crop, ExternalLink, Eye, Image as ImageIcon, Images, Palette, Pause, Pencil, Play, RefreshCw, Send, Square, Upload, X } from 'lucide-react';
import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import OriginalUploadStatus from '@/components/beadhue/OriginalUploadStatus';
import { RecropDialog } from '@/components/editor-workspace/recrop-dialog';
import { batchGenerationFailureMessage, officialBatchConcurrency } from '@/lib/community/batchClient';
import type { OfficialBatchSpec } from '@/lib/community/batchDefaults';
import type { CommunityPreviewV1, CommunitySnapshotV1 } from '@/lib/community/snapshot';
import type { CommunityRevisionInspection } from '@/lib/community/queries';
import { adminThumbnailUrl } from '@/lib/community/thumbnailUrl';
import { LIMITS } from '@/lib/appInfo';
import { compatibleBoardProfilesForPalette, defaultBoardProfileForPalette, getBoardProfile } from '@/lib/boardProfiles';
import { cn } from '@/lib/cn';
import { paletteColorsForSelection } from '@/lib/engine/kit';
import { remapPattern } from '@/lib/engine/remap';
import { createImageDecoder, type DecodedImage } from '@/lib/image/decode';
import { sniffImageType } from '@/lib/image/sniff';
import { KIT_TIERS, isKitTierAvailableForPalette, projectPaletteEngineColorCount } from '@/lib/kitTiers';
import { getBuiltinPalette, isBuiltinPaletteId, listBuiltinPalettes } from '@/lib/palettes';
import { DEFAULT_GENERATION_PARAMS, type GenerationParams, type Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { useAdminInspection } from '@/components/admin/useAdminInspection';
import { BatchSession, RETRYABLE_STATUSES, type BatchItem, type BatchItemStatus, type StoredBatch } from '@/components/admin/batchSession';
import { createOfficialBatchGeneratePool } from '@/components/admin/batchGeneration';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormAlert, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DraftPatternEditor } from './draft-pattern-editor';
import { AdminCard, CardHead, Mono } from './parts';

const t = zhCN.adminUi.batches;
const b = zhCN.communityAdmin.batch;
const c = zhCN.communityAdmin.command;
const icon = (Icon: typeof Check) => <Icon aria-hidden="true" strokeWidth={1.75} />;

type StatusFilter = 'all' | 'pending' | 'running' | 'saved' | 'failed' | 'published';
const FILTER_STATUSES: Record<Exclude<StatusFilter, 'all'>, readonly BatchItemStatus[]> = {
  pending: ['pending'], running: ['running', 'saving', 'uploading', 'save_unknown'], saved: ['saved'],
  failed: ['failed', 'cancelled', 'upload_failed', 'unavailable'], published: ['published'],
};
const STATUS_TONE: Record<BatchItemStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral', running: 'info', saving: 'info', uploading: 'info', save_unknown: 'warning', upload_failed: 'warning',
  saved: 'success', published: 'success', failed: 'danger', cancelled: 'neutral', unavailable: 'neutral',
};
const STEPS = ['select', 'configure', 'generate', 'publish'] as const;
type Step = typeof STEPS[number];

/** 列表预览（冻结的小图）→ 豆粒渲染用的图纸。 */
export function previewPattern(preview: CommunityPreviewV1): Pattern {
  return { width: preview.width, height: preview.height, cells: preview.cells.map((hex) => ({ hex, code: null, transparent: hex === null })) };
}

/** 折叠区块：按钮 + aria-expanded（原「样式化折叠」，E2E 以按钮名定位）。 */
function Disclosure({ summary, meta, open, onOpenChange, children }: { summary: string; meta?: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="rounded-md border border-line">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-3.5 text-left text-body-sm font-semibold text-ink focus-visible:focus-ring">
        <span className="min-w-0 flex-1">{summary}</span>
        {meta ? <span className="text-caption font-normal text-ink-3">{meta}</span> : null}
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className={cn('size-4 text-ink-3 transition-transform duration-state', open && 'rotate-180')} />
      </button>
      {open ? <div id={id} className="grid gap-3 border-t border-line p-3.5">{children}</div> : null}
    </div>
  );
}

function BatchSteps({ current }: { current: Step }) {
  const index = STEPS.indexOf(current);
  return (
    <ol aria-label={b.stepLabel(index + 1, STEPS.length)} className="flex flex-wrap gap-x-6 gap-y-2">
      {STEPS.map((step, position) => (
        <li key={step} aria-current={step === current ? 'step' : undefined} className={cn('flex items-center gap-2 text-body-sm', position <= index ? 'font-semibold text-ink' : 'text-ink-3')}>
          <span className={cn('grid size-6 place-items-center rounded-full text-caption font-semibold [&>svg]:size-3.5', position < index ? 'bg-ink text-on-ink' : position === index ? 'bg-ink text-on-ink' : 'bg-bg-muted text-ink-3')}>
            {position < index ? icon(Check) : position + 1}
          </span>
          {b.steps[step]}
        </li>
      ))}
    </ol>
  );
}

/** 数字输入：失焦或回车时提交（空 = 沿用统一值）。 */
function NumberInput({ label, value, min, max, placeholder, disabled, onCommit }: { label: string; value: number | undefined; min: number; max: number; placeholder?: string; disabled?: boolean; onCommit: (value: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setText(value === undefined ? '' : String(value)); }
  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) { onCommit(undefined); return; }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) { setText(value === undefined ? '' : String(value)); return; }
    onCommit(Math.min(max, Math.max(min, Math.round(parsed))));
  };
  return (
    <Field label={label}>
      <Input value={text} inputMode="numeric" placeholder={placeholder} disabled={disabled} className="h-control-sm text-body-sm"
        onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }} />
    </Field>
  );
}

function SpecPicker({ spec, onChange, disabled }: { spec: OfficialBatchSpec; onChange: (spec: OfficialBatchSpec) => void; disabled: boolean }) {
  const palette = spec.paletteSelection.palette;
  const brand = palette.kind === 'builtin' ? palette.brand : null;
  const boards = compatibleBoardProfilesForPalette(palette);
  const engineCount = projectPaletteEngineColorCount(palette);
  const tiers = KIT_TIERS.filter((tier) => isKitTierAvailableForPalette(tier, palette));
  const summary = brand ? getBuiltinPalette(brand) : null;
  const labeled = (label: string, node: ReactNode) => <div className="grid gap-1.5"><span className="text-footnote font-medium text-ink">{label}</span>{node}</div>;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        {labeled(b.specPalette, <Select label={b.specPalette} value={brand ?? ''} disabled={disabled} options={listBuiltinPalettes().map((entry) => ({ value: entry.id, label: `${entry.label} · ${entry.engineColorCount} 色` }))}
          onValueChange={(value) => {
            if (!isBuiltinPaletteId(value)) return;
            const projectPalette = { kind: 'builtin' as const, brand: value };
            const kitTier = isKitTierAvailableForPalette(spec.paletteSelection.kitTier, projectPalette) ? spec.paletteSelection.kitTier : 0;
            onChange({ boardProfile: defaultBoardProfileForPalette(projectPalette, spec.boardProfile), paletteSelection: { palette: projectPalette, kitTier } });
          }} />)}
        {labeled(b.specBoard, <Select label={b.specBoard} value={spec.boardProfile} disabled={disabled || boards.length <= 1} options={boards.map((board) => ({ value: board.id, label: board.displayName }))}
          onValueChange={(value) => { const board = boards.find((entry) => entry.id === value); if (board) onChange({ ...spec, boardProfile: board.id }); }} />)}
        {labeled(b.specKit, <Select label={b.specKit} value={String(spec.paletteSelection.kitTier)} disabled={disabled} options={tiers.map((tier) => ({ value: String(tier), label: tier === 0 ? b.specKitAll(engineCount) : b.specKitOption(tier) }))}
          onValueChange={(value) => { const tier = Number(value); if (isKitTierAvailableForPalette(tier, palette)) onChange({ ...spec, paletteSelection: { ...spec.paletteSelection, kitTier: tier } }); }} />)}
      </div>
      {summary ? <div aria-hidden="true" className="flex flex-wrap gap-0.5">{summary.engineColors.slice(0, 28).map((color) => <i key={color.hex} className="size-3 rounded-full inset-ring-1 inset-ring-ink/8" style={{ backgroundColor: color.hex }} />)}</div> : null}
    </div>
  );
}

function specSummary(spec: OfficialBatchSpec): string {
  const palette = spec.paletteSelection.palette;
  const paletteLabel = palette.kind === 'builtin' ? getBuiltinPalette(palette.brand).label : zhCN.share.customPalette(palette.colors.length);
  const kit = spec.paletteSelection.kitTier === 0 ? b.specKitAll(projectPaletteEngineColorCount(palette)) : b.specKitOption(spec.paletteSelection.kitTier);
  return b.specSummary(getBoardProfile(spec.boardProfile).displayName, paletteLabel, kit);
}

function ParamsEditor({ value, inherited, onChange, disabled = false }: { value: Partial<GenerationParams>; inherited?: GenerationParams; onChange: (value: Partial<GenerationParams>) => void; disabled?: boolean }) {
  const labels = { targetWidth: b.width, targetColorCount: b.colors, brightness: b.brightness, contrast: b.contrast, bgTolerance: b.bgTolerance } as const;
  const number = (key: keyof typeof labels, min: number, max: number) => (
    <NumberInput key={key} label={labels[key]} value={value[key]} min={min} max={max} disabled={disabled} placeholder={inherited ? String(inherited[key]) : undefined}
      onCommit={(next) => { const copy = { ...value }; if (next === undefined) delete copy[key]; else copy[key] = next; onChange(copy); }} />
  );
  const choice = (key: 'dithering' | 'backgroundRemoval' | 'mode', label: string, options: Array<{ value: string; label: string }>) => (
    <div key={key} className="grid gap-1.5"><span className="text-footnote font-medium text-ink">{label}</span>
      <Select size="sm" label={label} disabled={disabled} className="w-full" value={value[key] === undefined ? (inherited ? '' : String(key === 'mode' ? 'dominant' : false)) : String(value[key])} options={options}
        onValueChange={(raw) => { const next = { ...value } as Record<string, unknown>; if (!raw) delete next[key]; else next[key] = key === 'mode' ? raw : raw === 'true'; onChange(next as Partial<GenerationParams>); }} />
    </div>
  );
  const inherit = inherited ? [{ value: '', label: b.inherit }] : [];
  const onOff = [...inherit, { value: 'true', label: b.enabled }, { value: 'false', label: b.disabled }];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {number('targetWidth', 20, 200)}{number('targetColorCount', 2, 128)}
      {choice('mode', b.mode, [...inherit, { value: 'dominant', label: b.dominant }, { value: 'average', label: b.average }])}
      {choice('dithering', b.dithering, onOff)}
      {number('brightness', -100, 100)}{number('contrast', -100, 100)}
      {choice('backgroundRemoval', b.backgroundRemoval, onOff)}
      {number('bgTolerance', 0, 40)}
      <Field label={b.backgroundPrototype}>
        <Input value={value.backgroundPrototype ?? ''} maxLength={7} disabled={disabled} placeholder={inherited?.backgroundPrototype ?? b.autoBackground} className="h-control-sm font-mono text-body-sm"
          onChange={(event) => onChange({ ...value, backgroundPrototype: event.target.value || null })} />
      </Field>
    </div>
  );
}

function CropEditor({ item, session, onClose }: { item: BatchItem; session: BatchSession; onClose: () => void }) {
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; const decoder = createImageDecoder();
    void (async () => {
      try {
        if (!item.file) throw new Error(b.noOriginal);
        const bytes = new Uint8Array(await item.file.arrayBuffer()); if (!alive) return;
        const type = sniffImageType(bytes); if (type === 'unknown') throw new Error(b.unknownImage);
        const loaded = await decoder.load(bytes, type); if (!alive) return; if (!loaded.ok) throw new Error(zhCN.errors[loaded.code]);
        if ((loaded.image.naturalWidth ?? loaded.image.width) * (loaded.image.naturalHeight ?? loaded.image.height) > LIMITS.maxPixels) throw new Error(zhCN.errors.TOO_MANY_PIXELS);
        setImage(loaded.image);
      } catch (caught) { if (alive) setError(batchGenerationFailureMessage(caught)); }
      finally { decoder.dispose(); }
    })();
    return () => { alive = false; decoder.dispose(); };
  }, [item.file]);
  if (image) {
    const { defaults, spec } = session.getSnapshot();
    return <RecropDialog image={image} initialRect={item.crop ?? undefined} width={item.paramsOverride.targetWidth ?? defaults.targetWidth} boardSize={getBoardProfile(spec.boardProfile).boardCols} busy={false} onCancel={onClose} onConfirm={(crop) => { session.updateItem(item.localId, { crop }); onClose(); }} />;
  }
  if (!error) return null;
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent aria-label={b.cropTitle}>
        <DialogHeader><DialogTitle>{b.cropTitle}</DialogTitle></DialogHeader>
        <DialogBody><FormAlert>{error}</FormAlert></DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function DraftInspection({ item, onClose }: { item: BatchItem; onClose: () => void }) {
  const inspection = useAdminInspection<CommunityRevisionInspection>(`/api/admin/community/revisions/${item.revisionId}`);
  const data = inspection.data;
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg" aria-label={b.inspectTitle}>
        <DialogHeader><DialogTitle>{b.inspectTitle} · {item.title}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-3">
          {inspection.error ? <FormAlert>{inspection.error}</FormAlert> : !data ? <Skeleton className="h-80" /> : <>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <figure className="m-0 grid gap-2">
                <figcaption className="text-caption font-normal text-ink-3 tabular-nums">{data.snapshot.pattern.width}×{data.snapshot.pattern.height} · {getBoardProfile(data.snapshot.boardProfile).displayName}</figcaption>
                <div className="grid aspect-square place-items-center rounded-lg bg-bg-subtle"><BeadImage pattern={data.snapshot.pattern} alt={t.preview(item.title)} lazy={false} className="size-[88%]" /></div>
              </figure>
              <figure className="m-0 grid gap-2">
                <figcaption className="text-caption font-normal text-ink-3">{zhCN.adminUi.reviews.original}</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-bg-subtle"><img src={`/api/admin/community/revisions/${item.revisionId}/original`} alt={zhCN.adminUi.reviews.originalAlt(item.title)} className="size-full object-cover" /></div>
              </figure>
            </div>
            <Mono>{b.draftId} {item.revisionId}</Mono>
          </>}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** 官方草稿精细编辑（admin-round-3 05）：画笔 / 橡皮 / 油漆桶 / 吸管 / 撤销重做 / 全局换色 / 换色板重映射；保存写回同一份草稿。 */
function DraftEditor({ item, session, onClose }: { item: BatchItem; session: BatchSession; onClose: () => void }) {
  const [revision, setRevision] = useState<{ id: string; title: string; version: number; snapshot: CommunitySnapshotV1 } | null>(null);
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [remapTo, setRemapTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/community/revisions/${item.revisionId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body?.error?.message ?? zhCN.communityAdmin.queueLoadFailed); setRevision(body); setPattern(body.snapshot.pattern); })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : zhCN.communityAdmin.queueLoadFailed); });
    return () => controller.abort();
  }, [item.revisionId]);
  const palette = useMemo(() => (revision ? paletteColorsForSelection(revision.snapshot.paletteSelection) : []), [revision]);
  const currentBrand = revision?.snapshot.paletteSelection.palette.kind === 'builtin' ? revision.snapshot.paletteSelection.palette.brand : null;
  const dirty = Boolean(pattern && revision && pattern !== revision.snapshot.pattern);
  const close = () => { if (dirty) setDiscard(true); else onClose(); };
  const remap = () => {
    if (!revision || !pattern || !isBuiltinPaletteId(remapTo)) return;
    const selection = { palette: { kind: 'builtin' as const, brand: remapTo }, kitTier: revision.snapshot.paletteSelection.kitTier };
    setPattern(remapPattern(pattern, paletteColorsForSelection(selection)).pattern);
    setRevision({ ...revision, snapshot: { ...revision.snapshot, paletteSelection: selection } });
    setRemapTo('');
  };
  const save = async () => {
    if (!revision || !pattern) return;
    setSaving(true);
    try { session.stageSnapshot(item.localId, { ...revision.snapshot, pattern }); if (await session.saveItemEdits(item.localId)) onClose(); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent size="full" aria-label={b.editDraft} className="md:max-w-[min(1200px,calc(100vw-48px))]">
        <DialogHeader><DialogTitle>{b.editDraft} · {item.title}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-3">
          {revision ? <p className="text-body-sm text-ink-3">{b.editHelp(getBoardProfile(revision.snapshot.boardProfile).displayName)}</p> : null}
          {error ? <FormAlert>{error}</FormAlert> : !revision || !pattern ? <Skeleton className="h-96" /> : <>
            <DraftPatternEditor pattern={pattern} palette={palette} boardSize={getBoardProfile(revision.snapshot.boardProfile).boardCols} onPatternChange={setPattern} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-50 gap-1.5"><span className="text-footnote font-medium text-ink">{b.remapPalette}</span>
                <Select label={b.remapPalette} placeholder={b.remapPaletteChoose} value={remapTo} disabled={saving} onValueChange={setRemapTo} options={listBuiltinPalettes().filter((entry) => entry.id !== currentBrand).map((entry) => ({ value: entry.id, label: entry.label }))} />
              </div>
              <Button size="md" disabled={!remapTo || saving} onClick={remap}>{icon(Palette)}{b.remapSubmit}</Button>
            </div>
            {currentBrand && isBuiltinPaletteId(currentBrand) ? <p className="text-caption font-normal text-ink-3">{b.remapHelp(getBuiltinPalette(currentBrand).label, palette.length)}</p> : null}
          </>}
          {discard ? <FormAlert>{b.editDiscard}</FormAlert> : null}
        </DialogBody>
        <DialogFooter>
          {discard ? <Button variant="danger" onClick={onClose}>{b.editDiscardConfirm}</Button> : <Button disabled={saving} onClick={close}>{b.editClose}</Button>}
          <Button variant="primary" loading={saving} disabled={!revision || !pattern || saving || session.locked} onClick={() => void save()}>{icon(Check)}{b.saveEdits}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 草稿卡片：已保存的草稿用服务端缩略图，生成中的用本地预览；按 item 引用 memo，进度刷新只重画变化的卡。 */
const BatchCard = memo(function BatchCard({ item, index, session, editable, serverThumbnails, defaults, locked, processing, conflict, hasSave, onCrop, onInspect, onEdit }: {
  item: BatchItem; index: number; session: BatchSession; editable: boolean; serverThumbnails: boolean; defaults: GenerationParams;
  locked: boolean; processing: boolean; conflict: boolean; hasSave: boolean; onCrop: (id: string) => void; onInspect: (id: string) => void; onEdit: (id: string) => void;
}) {
  const [overridesOpen, setOverridesOpen] = useState(false);
  const busy = ['running', 'saving', 'uploading'].includes(item.status);
  const retryable = RETRYABLE_STATUSES.includes(item.status) && (item.file || hasSave);
  const needsOriginal = item.status === 'upload_failed' && !item.file && item.revisionId;
  const overrideCount = Object.keys(item.paramsOverride).length;
  const canEdit = editable && item.status !== 'published' && !busy;
  const canRegenerate = canEdit && Boolean(item.file) && !hasSave && Boolean(item.revisionId);
  const fileInput = useRef<HTMLInputElement>(null);
  const pattern = useMemo(() => (item.preview ? previewPattern(item.preview) : null), [item.preview]);
  return (
    <li data-batch-card="" data-status={item.status} aria-label={b.itemLabel(index + 1)} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-bg">
      <div className="relative grid aspect-square place-items-center bg-bg-subtle">
        {item.revisionId && item.preview && serverThumbnails
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={adminThumbnailUrl(item.revisionId)} alt={b.previewLabel(item.title)} loading="lazy" className="size-full bg-bg object-contain p-[8%]" />
          : pattern ? <BeadImage pattern={pattern} alt={b.previewLabel(item.title)} className="size-full" />
            : <span className="grid justify-items-center gap-1 text-body-sm text-ink-3 [&>svg]:size-6">{busy ? <b className="text-title-2 text-ink tabular-nums">{t.percent(item.progress)}</b> : <>{icon(ImageIcon)}{b.noPreview}</>}</span>}
        {busy ? <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} className="absolute inset-x-0 bottom-0 h-1 bg-bg-muted"><i className="block h-full bg-ink transition-[width] duration-state" style={{ width: `${item.progress}%` }} /></div> : null}
        <span className="absolute top-2.5 left-2.5 rounded-full bg-bg/94 px-2 py-0.5 text-caption text-ink shadow-badge tabular-nums">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="grid flex-1 content-start gap-2.5 p-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[item.status]} dot>{b.status[item.status]}</Badge>
          {item.hasOriginal && item.status !== 'published' ? <Badge tone="success">{icon(Check)}{b.originalReady}</Badge> : null}
          {item.dirty ? <Badge tone="warning">{b.dirty}</Badge> : null}
        </div>
        <Field label={b.publicTitle}>
          <Input value={item.title} maxLength={80} disabled={!canEdit} className="h-control-sm text-body-sm" onChange={(event) => session.updateItem(item.localId, { title: event.target.value })} />
        </Field>
        <p className="flex min-w-0 items-center gap-1 text-caption font-normal text-ink-3 [&>svg]:size-3.5 [&>svg]:shrink-0">{icon(ImageIcon)}<span className="truncate">{item.localName}{item.preview ? ` · ${item.preview.originalWidth}×${item.preview.originalHeight}` : ''}{item.revisionVersion !== null ? ` · ${b.revisionVersion(item.revisionVersion)}` : ''}</span></p>
        {item.file && canEdit ? (
          <div className="flex flex-wrap items-center gap-2 text-caption font-normal text-ink-3">
            <Button size="sm" onClick={() => onCrop(item.localId)}>{icon(Crop)}{item.crop ? b.recrop : b.cropTitle}</Button>
            <span>{item.crop ? b.cropSummary(item.crop.width, item.crop.height) : b.uncropped}</span>
            {item.crop ? <Button size="sm" variant="ghost" onClick={() => session.updateItem(item.localId, { crop: null })}>{b.resetCrop}</Button> : null}
          </div>
        ) : null}
        {canEdit ? (
          <Disclosure summary={b.itemOverrides} meta={overrideCount ? String(overrideCount) : undefined} open={overridesOpen} onOpenChange={setOverridesOpen}>
            <ParamsEditor value={item.paramsOverride} inherited={defaults} onChange={(paramsOverride) => session.updateItem(item.localId, { paramsOverride })} />
            {overrideCount ? <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => session.updateItem(item.localId, { paramsOverride: {} })}>{icon(X)}{b.resetOverrides}</Button> : null}
          </Disclosure>
        ) : null}
        {item.error ? <FormAlert>{item.error}</FormAlert> : null}
        {item.status === 'save_unknown' ? <p className="text-footnote text-warning">{b.saveUnknown}</p> : null}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
        {item.status === 'saved' ? <Checkbox checked={item.selected} disabled={locked} onCheckedChange={(checked) => session.updateItem(item.localId, { selected: Boolean(checked) })}>{b.selectPublish}</Checkbox> : null}
        {item.dirty && item.status === 'saved' ? <Button size="sm" variant="primary" disabled={locked || processing || conflict} onClick={() => void session.saveItemEdits(item.localId)}>{icon(Check)}{b.saveEdits}</Button> : null}
        {canRegenerate ? <Button size="sm" disabled={locked || processing || conflict} onClick={() => void session.regenerateItem(item.localId)}>{icon(RefreshCw)}{b.regenerate}</Button> : null}
        {item.revisionId && ['saved', 'published', 'upload_failed'].includes(item.status) ? <>
          <Button size="sm" disabled={locked || processing || item.status === 'upload_failed'} onClick={() => onEdit(item.localId)}>{icon(Pencil)}{b.editDraft}</Button>
          <Button size="sm" onClick={() => onInspect(item.localId)}>{icon(Eye)}{b.inspectTitle}</Button>
        </> : null}
        {['pending', 'running', 'failed'].includes(item.status) ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => session.cancelItem(item.localId)}>{icon(X)}{b.cancelItem}</Button> : null}
        {retryable ? <Button size="sm" disabled={locked || processing || conflict} onClick={() => void session.retryItem(item.localId)}>{icon(RefreshCw)}{item.status === 'upload_failed' ? b.retryUpload : hasSave ? b.retrySave : b.retry}</Button> : null}
        {needsOriginal ? <>
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" aria-label={b.attachOriginal} disabled={locked} onChange={(event) => { const file = event.target.files?.[0]; if (file) void session.attachOriginal(item.localId, file); event.target.value = ''; }} />
          <Button size="sm" disabled={locked} onClick={() => fileInput.current?.click()}>{icon(Upload)}{b.attachOriginal}</Button>
        </> : null}
        {item.status === 'published' && item.workId ? <a href={`/community/${item.workId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-body-sm font-medium text-accent hover:underline focus-visible:focus-ring [&>svg]:size-4">{b.openPublic}{icon(ExternalLink)}</a> : null}
      </footer>
    </li>
  );
});

/**
 * 官方批次工作室（四步：选图 → 参数与裁剪 → 生成 → 核对与发布），业务沿用 BatchSession（幂等键、同键恢复、
 * 草稿原地修订、原图随草稿上传）；界面换成新组件。restore 给定时从服务器恢复该批次的已保存草稿。
 */
export function BatchStudio({ restore, name, onBack, onChanged }: { restore: StoredBatch | null; name?: string; onBack: () => void; onChanged: () => void }) {
  const [{ session, pool }] = useState(() => {
    const concurrency = officialBatchConcurrency(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
      typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    const nextPool = createOfficialBatchGeneratePool(concurrency);
    const next = new BatchSession({ generate: nextPool.generate, concurrency });
    if (restore) next.restore(restore);
    else if (name) next.setName(name);
    return { session: next, pool: nextPool };
  });
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const cleanup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const publishOpener = useRef<HTMLButtonElement>(null);
  const [cropId, setCropId] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<File[] | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [dragging, setDragging] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(true);
  useEffect(() => {
    // Strict Mode 会立刻重新订阅；只有真正离开页面时才释放会话与生成池（不写任何浏览器存储）。
    if (cleanup.current) clearTimeout(cleanup.current);
    return () => { cleanup.current = setTimeout(() => { session.dispose(); pool.dispose(); }, 0); };
  }, [session, pool]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (session.processing || session.locked || session.retainedSaveCount || session.getSnapshot().items.some((item) => item.file)) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [session]);
  const { items, batch } = state;
  useEffect(() => { if (batch) onChanged(); }, [batch?.status, batch, onChanged]);
  const selected = items.filter((item) => item.status === 'saved' && item.selected);
  const publishable = items.filter((item) => item.status === 'saved');
  const editable = !batch && !session.locked;
  const dirtyCount = items.filter((item) => item.dirty).length;
  const cropItem = items.find((item) => item.localId === cropId);
  const inspected = items.find((item) => item.localId === inspectId);
  const edited = items.find((item) => item.localId === editId);
  const visible = filter === 'all' ? items : items.filter((item) => FILTER_STATUSES[filter].includes(item.status));
  const countFor = (key: StatusFilter) => (key === 'all' ? items.length : items.filter((item) => FILTER_STATUSES[key].includes(item.status)).length);
  const processed = items.filter((item) => !['pending', 'running', 'saving', 'uploading'].includes(item.status)).length;
  const inFlight = items.some((item) => ['pending', 'running', 'saving', 'uploading'].includes(item.status));
  const generating = Boolean(batch) && (state.mode === 'running' || inFlight) && !['completed', 'cancelled'].includes(batch?.status ?? '');
  const step: Step = !items.length && !batch ? 'select' : !batch ? 'configure' : generating && inFlight ? 'generate' : 'publish';
  const retryableCount = items.filter((item) => RETRYABLE_STATUSES.includes(item.status) && (item.file || session.hasSave(item.localId))).length;
  const choose = (files: File[]) => {
    if (!session.replaceable || !files.length) return;
    if (items.some((item) => item.file)) { setReplacement(files); return; }
    session.selectFiles(files); setConfirmPublish(false); setConfirmed(false); setFilter('all');
  };
  const refresh = async () => {
    if (session.locked || session.processing || !batch) return;
    setRefreshError(null);
    try {
      const response = await fetch('/api/admin/batches?size=100', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || c.refreshFailed);
      const current = (body.items as StoredBatch[]).find((entry) => entry.id === batch.id);
      if (!current) { setRefreshError(b.batchNotFound); return; }
      session.refreshState(current); setConfirmPublish(false); setConfirmed(false); onChanged();
    } catch (error) { setRefreshError(error instanceof Error ? error.message : c.refreshFailed); }
  };
  const picker = (
    <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" aria-label={b.selectFiles} disabled={!session.replaceable}
      onChange={(event) => { choose([...(event.target.files ?? [])]); event.target.value = ''; }} />
  );
  const pickButton = (primary: boolean) => (
    <Button data-batch-pick="" variant={primary ? 'primary' : 'secondary'} size={primary ? 'md' : 'sm'} disabled={!session.replaceable} onClick={() => fileInput.current?.click()}>
      {icon(primary ? Upload : RefreshCw)}{primary ? b.selectFiles : t.dropReplace}
    </Button>
  );
  return (
    <section aria-label={state.name || t.studio} className="grid gap-4" data-batch-studio="">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          {state.name ? <h2 className="truncate text-title-2 text-ink">{state.name}</h2> : null}
          <BatchSteps current={step} />
        </div>
        <Button size="sm" variant="ghost" disabled={session.processing || session.locked} onClick={onBack}>{t.back}</Button>
      </div>
      <OriginalUploadStatus />
      {!items.length && state.error ? <FormAlert>{state.error}</FormAlert> : null}
      {picker}
      {step === 'select' ? (
        <>
          <div onDragOver={(event) => { if (session.replaceable) { event.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); choose([...event.dataTransfer.files]); }}
            className={cn('grid justify-items-center gap-3 rounded-lg border-2 border-dashed border-line-strong bg-bg px-6 py-12 text-center transition-colors duration-state', dragging && 'border-accent bg-accent-soft')}>
            <span className="grid size-12 place-items-center rounded-full bg-bg-muted text-ink-2 [&>svg]:size-6">{icon(Images)}</span>
            <p className="grid gap-1"><b className="text-title-3 text-ink">{b.dropTitle}</b><small className="text-body-sm text-ink-3">{b.dropHint}</small></p>
            {pickButton(true)}
          </div>
          <p className="text-body-sm text-ink-3">{b.privacy}</p>
          <AdminCard>
            <CardHead title={b.spec} aside={specSummary(state.spec)} />
            <div className="p-5 max-md:p-4"><SpecPicker spec={state.spec} onChange={(spec) => session.setSpec(spec)} disabled={!editable} /></div>
          </AdminCard>
        </>
      ) : (
        <>
          <AdminCard>
            <CardHead title={b.configureTitle}>
              <span className="ml-auto flex min-w-0 items-center gap-3">
                <span data-batch-summary="" className="truncate text-body-sm text-ink-3">{b.itemsTitle(items.length)}{batch ? ` · ${b.batchStatus[batch.status]} · ${b.counts(items.filter((item) => ['saved', 'published'].includes(item.status)).length, items.length)}` : ''}</span>
                {pickButton(false)}
              </span>
            </CardHead>
            <div className="grid gap-3 p-5 max-md:p-4">
              {batch ? <Mono>{b.batchId} {batch.id}</Mono> : null}
              <Disclosure summary={b.spec} meta={specSummary(state.spec)} open={specOpen} onOpenChange={setSpecOpen}>
                <SpecPicker spec={state.spec} onChange={(spec) => session.setSpec(spec)} disabled={!editable} />
                <p className="text-caption font-normal text-ink-3">{b.specFrozen}</p>
              </Disclosure>
              <Disclosure summary={`${b.uniformParams} · ${state.defaults.targetWidth} ${b.widthUnit} · ${state.defaults.targetColorCount} ${b.colorUnit}`} open={paramsOpen} onOpenChange={setParamsOpen}>
                <ParamsEditor value={state.defaults} disabled={session.locked} onChange={(value) => session.setDefaults({ ...DEFAULT_GENERATION_PARAMS, ...value })} />
                <p className="text-caption font-normal text-ink-3">{b.uniformParamsHelp}</p>
              </Disclosure>
              <Field label={b.reason}><Input value={state.reason} disabled={session.locked} maxLength={500} onChange={(event) => session.setReason(event.target.value)} /></Field>
            </div>
          </AdminCard>
          {state.error ? <FormAlert>{state.error}</FormAlert> : null}
          {state.uncertain ? <div className="flex flex-wrap items-center gap-3"><FormAlert>{c.uncertain}</FormAlert><Button size="sm" disabled={state.busy} onClick={() => void session.retryCommand()}>{c.retry}</Button></div> : null}
          {state.notice ? <FormNotice tone="info">{state.notice}</FormNotice> : null}
          {state.conflict ? <FormAlert>{b.conflictHelp}</FormAlert> : null}
          {refreshError ? <FormAlert>{refreshError}</FormAlert> : null}
          <div className="sticky top-[calc(var(--spacing-topbar)+8px)] z-20 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg px-4 py-3 shadow-float max-md:static max-md:shadow-none">
            {!batch ? <Button variant="primary" loading={state.busy} disabled={session.locked || Boolean(cropItem) || !items.some((item) => item.status === 'pending')} onClick={() => void session.start()}>{icon(Play)}{state.busy ? b.working : b.start}</Button> : <>
              {step === 'generate' ? <span className="text-body-sm text-ink-2 tabular-nums">{b.progressTitle(processed, items.length)}</span> : null}
              {batch.status === 'running' && state.mode === 'running' ? <Button disabled={session.locked} onClick={() => void session.pause()}>{icon(Pause)}{b.pause}</Button> : null}
              {state.mode !== 'running' && items.some((item) => item.status === 'pending') ? <Button disabled={session.locked || session.processing || state.conflict} onClick={() => void session.resume()}>{icon(Play)}{b.resume}</Button> : null}
              {['running', 'paused'].includes(batch.status) ? <>
                <Button variant="danger-outline" disabled={session.locked} onClick={() => void session.cancel()}>{icon(Square)}{b.cancel}</Button>
                <Button disabled={session.locked || session.processing || Boolean(session.retainedSaveCount) || state.conflict || items.some((item) => item.status === 'pending')} onClick={() => void session.finish()}>{icon(Check)}{b.finishBatch}</Button>
              </> : null}
              <Button variant="ghost" disabled={session.locked || session.processing} onClick={() => void refresh()}>{icon(RefreshCw)}{c.refresh}</Button>
              {retryableCount ? <Button disabled={session.locked || session.processing || state.conflict} onClick={() => void session.retryAllFailed()}>{icon(RefreshCw)}{b.retryAll} · {retryableCount}</Button> : null}
              <span className="min-w-0 flex-1" />
              <span className="text-body-sm text-ink-3 tabular-nums">{b.selectedSummary(selected.length, publishable.length)}</span>
              <Button disabled={session.locked || !publishable.length || selected.length === publishable.length} onClick={() => session.selectAll()}>{b.selectAll}</Button>
              {selected.length ? <Button variant="ghost" disabled={session.locked} onClick={() => session.clearSelection()}>{b.clearSelection}</Button> : null}
              <Button ref={publishOpener} variant="primary" disabled={session.locked || session.processing || Boolean(session.retainedSaveCount) || state.conflict || !selected.length || dirtyCount > 0}
                onClick={() => { setConfirmPublish(true); setConfirmed(false); }}>{icon(Send)}{b.publishSelected} · {selected.length}</Button>
            </>}
          </div>
          {step === 'generate' ? <p className="text-body-sm text-ink-3">{b.generatingHint}</p> : null}
          {dirtyCount ? <FormAlert>{b.dirtyHint}</FormAlert> : null}
          {step === 'publish' && publishable.length ? <p className="text-body-sm text-ink-3">{b.reviewHint}</p> : null}
          {batch ? (
            <div role="group" aria-label={b.filterLabel} className="flex flex-wrap gap-2">
              {(['all', 'pending', 'running', 'saved', 'failed', 'published'] as StatusFilter[]).map((key) => <Chip key={key} selected={filter === key} count={countFor(key)} onClick={() => setFilter(key)}>{key === 'all' ? b.filterAll : b.filters[key]}</Chip>)}
            </div>
          ) : null}
          <ol data-batch-cards="" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((item) => (
              <BatchCard key={item.localId} item={item} index={items.indexOf(item)} session={session} editable={!session.locked} serverThumbnails={!(batch && state.mode === 'running')}
                defaults={state.defaults} locked={session.locked} processing={session.processing} conflict={state.conflict} hasSave={session.hasSave(item.localId)}
                onCrop={setCropId} onInspect={setInspectId} onEdit={setEditId} />
            ))}
          </ol>
          {!visible.length ? <EmptyState compact kind="search" title={b.filterEmpty} /> : null}
        </>
      )}
      {cropItem ? <CropEditor item={cropItem} session={session} onClose={() => setCropId(null)} /> : null}
      {inspected?.revisionId ? <DraftInspection item={inspected} onClose={() => setInspectId(null)} /> : null}
      {edited?.revisionId ? <DraftEditor item={edited} session={session} onClose={() => setEditId(null)} /> : null}
      <Dialog open={Boolean(replacement)} onOpenChange={(next) => { if (!next) setReplacement(null); }}>
        <DialogContent aria-label={b.replaceTitle}>
          <DialogHeader><DialogTitle>{b.replaceTitle}</DialogTitle></DialogHeader>
          <DialogBody><DialogDescription>{b.replaceHelp}</DialogDescription></DialogBody>
          <DialogFooter>
            <Button onClick={() => setReplacement(null)}>{b.keepFiles}</Button>
            <Button variant="danger" onClick={() => { if (replacement) session.selectFiles(replacement); setReplacement(null); setConfirmPublish(false); setFilter('all'); }}>{b.replaceConfirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmPublish} onOpenChange={(next) => { if (!next && !session.locked) { setConfirmPublish(false); window.requestAnimationFrame(() => publishOpener.current?.focus()); } }}>
        <DialogContent aria-label={b.publishSelected}>
          <DialogHeader><DialogTitle>{b.publishSelected}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-3">
            <DialogDescription>{b.publishHelp}</DialogDescription>
            <ol className="grid list-decimal gap-1 pl-8 text-body-sm text-ink-2 marker:text-ink-3 marker:tabular-nums">{selected.map((item) => <li key={item.localId} className="[overflow-wrap:anywhere]">{item.title}</li>)}</ol>
            <Checkbox checked={confirmed} disabled={session.locked} onCheckedChange={(checked) => setConfirmed(Boolean(checked))}>{b.confirmPublication}</Checkbox>
            {state.error ? <FormAlert>{state.error}</FormAlert> : null}
            {state.uncertain ? <div className="flex flex-wrap items-center gap-3"><FormAlert>{c.uncertain}</FormAlert>
              <Button size="sm" disabled={state.busy} onClick={() => void session.retryCommand().then(() => { if (!session.locked && !session.getSnapshot().error) setConfirmPublish(false); })}>{c.retry}</Button></div> : null}
          </DialogBody>
          <DialogFooter>
            <Button disabled={session.locked} onClick={() => { setConfirmPublish(false); window.requestAnimationFrame(() => publishOpener.current?.focus()); }}>{b.backToDrafts}</Button>
            <Button variant="primary" disabled={!confirmed || session.locked || !selected.length} loading={state.busy && confirmed}
              onClick={() => void session.publish().then(() => { if (!session.locked && !session.getSnapshot().error) { setConfirmPublish(false); onChanged(); } })}>{icon(Send)}{b.confirmPublish}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
