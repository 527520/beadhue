'use client';

/**
 * 官方草稿精细编辑器（admin-round-3 05）。
 *
 * 把工作台的像素编辑器搬进后台，按用户口径做减法：
 * 保留 画笔 / 橡皮 / 油漆桶 / 吸管 / 画笔尺寸 / 缩放 / 撤销重做 / 全局换色 / 换色板重映射；
 * 不搬 镜像旋转与清空、导出（PNG/PDF/项目文件/采购清单）、跟拼进度、分享、云端同步。
 *
 * 编辑结果通过 `BatchSession.stageSnapshot` 暂存、由「保存修改」写回**同一份**草稿修订
 * （原地修订，ADR-0024），所以保存前的任何修改都不会影响服务器上的现有版本。
 */
import { useEffect, useMemo, useState } from 'react';
import PixelEditorCanvas from '@/components/editor/PixelEditorCanvas';
import { getBoardProfile } from '@/lib/boardProfiles';
import { paletteColorsForSelection } from '@/lib/engine/kit';
import { remapPattern } from '@/lib/engine/remap';
import { isBuiltinPaletteId, listBuiltinPalettes } from '@/lib/palettes';
import type { CommunitySnapshotV1 } from '@/lib/community/snapshot';
import type { PaletteColor, Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import Button from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import Notice from '@/components/ui/Notice';
import ResponsiveSelect from '@/components/ui/ResponsiveSelect';
import { AdminSkeleton } from './AdminPrimitives';
import type { BatchItem, BatchSession } from './batchSession';

const t = zhCN.communityAdmin.batch;

interface RevisionPayload { id: string; title: string; version: number; status: string; snapshot: CommunitySnapshotV1 }

export default function BatchDraftEditor({ item, session, onClose }: { item: BatchItem; session: BatchSession; onClose: () => void }) {
  const [revision, setRevision] = useState<RevisionPayload | null>(null);
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [remapTo, setRemapTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    if (!item.revisionId) return;
    let alive = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/admin/community/revisions/${item.revisionId}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? zhCN.communityAdmin.queueLoadFailed);
        if (alive) { setRevision(body as RevisionPayload); setPattern((body as RevisionPayload).snapshot.pattern); }
      } catch (caught) {
        if (alive) setError(controller.signal.aborted ? zhCN.communityAdmin.command.readTimeout : caught instanceof Error ? caught.message : zhCN.communityAdmin.queueLoadFailed);
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [item.revisionId]);

  const palette: PaletteColor[] = useMemo(() => revision ? paletteColorsForSelection(revision.snapshot.paletteSelection) : [], [revision]);
  const boardSize = revision ? getBoardProfile(revision.snapshot.boardProfile).boardCols : 29;
  const currentBrand = revision && revision.snapshot.paletteSelection.palette.kind === 'builtin' ? revision.snapshot.paletteSelection.palette.brand : null;
  const remapOptions = useMemo(() => listBuiltinPalettes()
    .filter((entry) => entry.id !== currentBrand)
    .map((entry) => ({ value: entry.id as string, label: entry.label })), [currentBrand]);
  const dirty = pattern !== null && revision !== null && pattern !== revision.snapshot.pattern;
  const remapHelp = currentBrand && isBuiltinPaletteId(currentBrand) ? t.remapHelp(listBuiltinPalettes().find((entry) => entry.id === currentBrand)?.label ?? currentBrand, palette.length) : null;

  const remap = () => {
    if (!revision || !pattern || !isBuiltinPaletteId(remapTo)) return;
    const next = { kind: 'builtin' as const, brand: remapTo };
    const selection = { palette: next, kitTier: revision.snapshot.paletteSelection.kitTier };
    setPattern(remapPattern(pattern, paletteColorsForSelection(selection)).pattern);
    setRevision({ ...revision, snapshot: { ...revision.snapshot, paletteSelection: selection } });
    setRemapTo('');
  };
  const save = async () => {
    if (!revision || !pattern) return;
    setSaving(true);
    try {
      // 快照由服务端重建派生列（尺寸 / 颜色数 / 预览），客户端只提交图纸与色板身份。
      session.stageSnapshot(item.localId, { ...revision.snapshot, pattern });
      const ok = await session.saveItemEdits(item.localId);
      if (ok) onClose();
    } finally { setSaving(false); }
  };
  const requestClose = async () => {
    if (dirty && !await confirm({ title: t.editDiscardTitle, message: t.editDiscard, confirmLabel: t.editDiscardConfirm, danger: true })) return;
    onClose();
  };

  return <Modal label={t.editDraft} onClose={() => void requestClose()} panelClassName="batch-editor">
    <header className="batch-editor-head"><h2>{t.editDraft} · {item.title}</h2>{revision && <p className="admin-help">{t.editHelp(getBoardProfile(revision.snapshot.boardProfile).displayName)}</p>}</header>
    {error ? <Notice kind="danger">{error}</Notice> : !revision || !pattern ? <AdminSkeleton rows={4} label={zhCN.communityAdmin.command.loading} /> : <>
      <PixelEditorCanvas pattern={pattern} palette={palette} boardSize={boardSize} layout="desktop" hideOps={['transform', 'clear']} onPatternChange={setPattern} />
      <div className="batch-editor-remap">
        <ResponsiveSelect label={t.remapPalette} value={remapTo} disabled={saving} onValueChange={setRemapTo} options={[{ value: '', label: t.remapPaletteChoose }, ...remapOptions]} />
        <Button variant="secondary" size="sm" icon="palette" disabled={!remapTo || saving} onClick={remap}>{t.remapSubmit}</Button>
      </div>
      {remapHelp && <p className="admin-help">{remapHelp}</p>}
    </>}
    <div className="modal-actions">
      <Button variant="quiet" disabled={saving} onClick={() => void requestClose()}>{t.editClose}</Button>
      <Button variant="primary" icon="check" disabled={!revision || !pattern || saving || session.locked} loading={saving} onClick={() => void save()}>{t.saveEdits}</Button>
    </div>
    {confirmDialog}
  </Modal>;
}
