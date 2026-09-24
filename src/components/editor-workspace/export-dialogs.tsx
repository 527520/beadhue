'use client';

/**
 * 导出弹窗（原型 editor.js pngDialog / pdfDialog）：界面换新，导出逻辑沿用 lib/export（PNG 规划、超限拆包、PDF 分页与字体子集）。
 */
import { Image as ImageIcon, Printer } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { usePublicConfig } from '@/components/config/usePublicConfig';
import { triggerDownload } from '@/lib/export/download';
import { track } from '@/lib/analytics/client';
import { DEFAULT_BOARD_SIZE } from '@/lib/boardProfiles';
import { EXPORT_CELL_PX_CHOICES, nearestCellPxChoice, patternHasPaintedCells } from '@/lib/export/layout';
import { exportPngBlob } from '@/lib/export/png';
import { createPngArchiveBlob } from '@/lib/export/pngArchive';
import { createPngExportPlan, largestFittingPngCellPx } from '@/lib/export/pngPlan';
import { labelVisible } from '@/lib/render/layout';
import { loadPdfCjkFont } from '@/lib/export/pdfFont';
import { buildExportFilename, computePdfLayout, paginateLegendItems, resolveBoardPdfMetrics } from '@/lib/export/pdfLayout';
import type { Pattern, PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { Note, SwitchRow, FieldLabel } from './editor-parts';

const REVOKE_DELAY_MS = 1_500;

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: Pattern;
  designName: string;
  boardSize: number;
  analyticsSource: 'community' | 'other';
}

export function PngDialog({ open, onOpenChange, ...rest }: ExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PngDialogBody onDone={() => onOpenChange(false)} {...rest} /> : null}
    </Dialog>
  );
}

function PngDialogBody({ pattern, designName, boardSize, analyticsSource, onDone }: Omit<ExportDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const t = zhCN.editorWorkspace.png;
  const toast = useToast();
  const config = usePublicConfig().exportPng;
  // 裁边沿用站点配置（面板不再单独给开关，按底板分页时不裁）。
  const crop = config.cropToContent;
  const [cellPx, setCellPx] = useState<number>(() => nearestCellPxChoice(config.cellPx));
  const [codes, setCodes] = useState(true);
  const [legend, setLegend] = useState<boolean>(config.includeLegend);
  const [byBoard, setByBoard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const empty = useMemo(() => !patternHasPaintedCells(pattern), [pattern]);
  const boards = { cols: Math.ceil(pattern.width / boardSize), rows: Math.ceil(pattern.height / boardSize) };
  const boardCount = boards.cols * boards.rows;
  // 每块板一张图不会超出浏览器上限，只有整张导出才需要按格宽预检。
  const fits = useMemo(() => new Map(EXPORT_CELL_PX_CHOICES.map((size) => {
    if (byBoard) return [size, true] as const;
    const plan = createPngExportPlan(pattern, { cellPx: size, cropToContent: crop, includeLegend: legend });
    return [size, plan.kind === 'single' || plan.kind === 'split'] as const;
  })), [byBoard, crop, legend, pattern]);
  const plan = useMemo(() => createPngExportPlan(pattern, { cellPx, cropToContent: crop, includeLegend: legend }), [cellPx, crop, legend, pattern]);
  const planFits = byBoard || plan.kind === 'single' || plan.kind === 'split';
  const suggested = useMemo(() => largestFittingPngCellPx(pattern, EXPORT_CELL_PX_CHOICES, { cropToContent: crop, includeLegend: legend }), [crop, legend, pattern]);
  const planSize = byBoard ? { width: pattern.width * cellPx, height: pattern.height * cellPx } : plan.kind === 'single' || plan.kind === 'split' ? plan.pattern : null;

  const download = async () => {
    if (pending.current || empty || !planFits) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await exportPngBlob(pattern, designName, { cellPx, cropToContent: crop, includeLegend: legend, includeCodes: codes, byBoard, boardSize });
      if (!result.ok) {
        track({ name: 'export_failed', properties: { format: 'png', errorCode: result.code } });
        setError(result.code === 'EMPTY_PATTERN' ? zhCN.export.pngEmptyError : result.code === 'CANVAS_TOO_LARGE' ? zhCN.export.pngTooLargeError(suggested ?? cellPx) : zhCN.export.pngFailed);
        return;
      }
      const blob = result.kind === 'single' ? result.artifact.blob : await createPngArchiveBlob(result.kind === 'split' ? [result.pattern, result.legend] : result.artifacts);
      const name = result.kind === 'single' ? result.artifact.fileName : result.archiveFileName;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
      }
      track({ name: 'design_exported', properties: { format: 'png', source: analyticsSource } });
      toast(t.downloaded, { icon: <ImageIcon aria-hidden="true" strokeWidth={1.75} /> });
      onDone();
    } catch {
      setError(zhCN.export.pngFailed);
      track({ name: 'export_failed', properties: { format: 'png', errorCode: 'PNG_EXPORT_FAILED' } });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-2">
          <FieldLabel>{t.cell}</FieldLabel>
          <div role="group" aria-label={t.cell} className="flex gap-0.5 rounded-full bg-bg-muted p-0.75">
            {EXPORT_CELL_PX_CHOICES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={size === cellPx}
                disabled={busy || !fits.get(size)}
                title={fits.get(size) ? undefined : t.cellTooLarge}
                onClick={() => setCellPx(size)}
                className={cn(
                  'inline-flex h-8.5 flex-1 items-center justify-center rounded-full text-footnote leading-none font-semibold whitespace-nowrap text-ink-3 transition-[background-color,color,box-shadow] duration-state hover:text-ink focus-visible:focus-ring',
                  'aria-pressed:bg-bg aria-pressed:text-ink aria-pressed:shadow-seg disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:text-ink-4',
                )}
              >
                {t.cellValue(size)}
              </button>
            ))}
          </div>
        </div>
        <SwitchRow label={t.codes} hint={codes && !labelVisible(cellPx) ? t.codesSmall : undefined} checked={codes} onCheckedChange={setCodes} disabled={busy} />
        <SwitchRow label={t.legend} hint={t.legendHint} checked={legend} onCheckedChange={setLegend} disabled={busy} />
        <SwitchRow label={t.byBoard} hint={t.byBoardHint(boardCount, boards.cols, boards.rows)} checked={byBoard} onCheckedChange={setByBoard} disabled={busy} />
        {empty ? (
          <FormAlert>{t.empty}</FormAlert>
        ) : !planFits ? (
          <FormAlert>{zhCN.export.pngTooLargeError(suggested ?? cellPx)}</FormAlert>
        ) : (
          <Note icon={<ImageIcon aria-hidden="true" strokeWidth={1.75} />}>
            <span role="status" className="tabular-nums">
              {planSize ? t.summary(planSize.width, planSize.height) : null}
              {byBoard ? ` · ${t.summaryBoards(boardCount)}` : ''}
              {legend ? ` · ${t.summaryLegend}` : ''}
              {!byBoard && plan.kind === 'split' ? ` · ${t.split}` : ''}
            </span>
          </Note>
        )}
        {error ? <FormAlert>{error}</FormAlert> : null}
      </DialogBody>
      <DialogFooter>
        <Button disabled={busy} onClick={onDone}>{zhCN.editorWorkspace.cancel}</Button>
        <Button variant="primary" loading={busy} disabled={empty || !planFits} onClick={() => void download()}>{t.download}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function PdfDialog({ open, onOpenChange, ...rest }: ExportDialogProps & { stats: readonly PatternStatsItem[]; cellMm?: number }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PdfDialogBody onDone={() => onOpenChange(false)} {...rest} /> : null}
    </Dialog>
  );
}

function PdfDialogBody({ pattern, designName, boardSize = DEFAULT_BOARD_SIZE, analyticsSource, stats, cellMm, onDone }: Omit<ExportDialogProps, 'open' | 'onOpenChange'> & { stats: readonly PatternStatsItem[]; cellMm?: number; onDone: () => void }) {
  const t = zhCN.editorWorkspace.pdf;
  const toast = useToast();
  const config = usePublicConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const metrics = useMemo(() => resolveBoardPdfMetrics(config.exportPdf, boardSize, cellMm ?? config.exportPdf.cellMm), [boardSize, cellMm, config]);
  const layout = useMemo(() => computePdfLayout(pattern.width, pattern.height, metrics, 'byBoard', boardSize), [boardSize, metrics, pattern.height, pattern.width]);
  const legendPages = useMemo(() => paginateLegendItems([...stats], metrics).length, [metrics, stats]);
  const boards = layout.boards ? layout.boards.rows * layout.boards.cols : 1;
  const multiBoard = boards > 1;
  const pages = layout.gridPages.length + legendPages + (multiBoard ? 1 : 0);
  const empty = stats.every((item) => item.count === 0);

  const download = async () => {
    if (pending.current || empty) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const text = `${designName}${stats.map((item) => item.code).join('')}`;
      const [{ generatePatternPdf }, fontBytes] = await Promise.all([import('@/lib/export/pdf'), loadPdfCjkFont(text)]);
      const bytes = await generatePatternPdf({ name: designName, pattern, stats: [...stats] }, { fontBytes, metrics, boardSize });
      triggerDownload(bytes, buildExportFilename(designName, pattern.width, pattern.height, 'pdf'));
      track({ name: 'design_exported', properties: { format: 'pdf', source: analyticsSource } });
      toast(t.downloaded, { icon: <Printer aria-hidden="true" strokeWidth={1.75} /> });
      onDone();
    } catch {
      setError(zhCN.exportPdf.failedError);
      track({ name: 'export_failed', properties: { format: 'pdf', errorCode: 'PDF_EXPORT_FAILED' } });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const facts: Array<[string, string]> = [
    [t.pages, t.pagesValue(pages)],
    [t.content, multiBoard && layout.boards ? t.contentBoards(boards, layout.boards.cols, layout.boards.rows, layout.gridPages.length, legendPages) : t.contentPlain(layout.gridPages.length, legendPages)],
    [t.paper, t.paperValue(metrics.cellMm)],
  ];
  return (
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <dl>
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-line py-2 last:border-b-0">
              <dt className="text-body-sm text-ink-3">{label}</dt>
              <dd className="text-body-sm font-medium text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <Note icon={<Printer aria-hidden="true" strokeWidth={1.75} />}>{t.note}</Note>
        {layout.gridPages.length > 10 ? <p className="text-caption font-normal text-ink-3">{t.large}</p> : null}
        {empty ? <FormAlert>{zhCN.exportPdf.emptyError}</FormAlert> : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
      </DialogBody>
      <DialogFooter>
        <Button disabled={busy} onClick={onDone}>{zhCN.editorWorkspace.cancel}</Button>
        <Button variant="primary" loading={busy} disabled={empty} onClick={() => void download()}>{t.download}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
