'use client';

/**
 * 右面板「信息」：尺寸、颗数、颜色、底板示意、规格、色板、原图同步状态，
 * 以及采购清单（每包颗数、按色取整的包数、复制清单）。
 */
import { ChevronDown, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { menuItemClass } from '@/components/ui/menu';
import { Textarea } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/toast';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { buildShoppingList, DEFAULT_BEADS_PER_PACK } from '@/lib/export/shoppingList';
import { cancelOriginalTask, originalTasks, ORIGINAL_STATUS_EVENT, resumeOriginalUploads, retryOriginalTask, type OriginalTask } from '@/lib/originals/client';
import type { OriginalReference } from '@/lib/originals/geometry';
import type { PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { boardsOf, colorName, formatCount, packOptions } from './editor-model';
import { BeadSwatch, PanelSection, SectionTitle } from './editor-parts';

export interface InfoPanelProps {
  designId: string;
  designName: string;
  width: number;
  height: number;
  stats: readonly PatternStatsItem[];
  total: number;
  boardSize: number;
  specLabel: string;
  paletteName: string;
  original?: OriginalReference;
  pack: number;
  onPackChange: (pack: number) => void;
}

function BoardsDiagram({ width, height, board }: { width: number; height: number; board: number }) {
  const { cols, rows } = boardsOf(width, height, board);
  const colW = Array.from({ length: cols }, (_, index) => Math.min(board, width - index * board) / board);
  const rowH = Array.from({ length: rows }, (_, index) => Math.min(board, height - index * board) / board);
  return (
    <span
      aria-hidden="true"
      className="grid max-h-16 w-11 shrink-0 gap-0.5"
      style={{ gridTemplateColumns: colW.map((value) => `${value}fr`).join(' '), gridTemplateRows: rowH.map((value) => `${value}fr`).join(' '), aspectRatio: `${width} / ${height}` }}
    >
      {Array.from({ length: cols * rows }, (_, index) => <i key={index} className="bg-bg-muted inset-ring-1 inset-ring-line-strong" />)}
    </span>
  );
}

/** 原图上传队列里与这张设计相关的最新任务（与旧 OriginalUploadStatus 同一数据源）。 */
function useOriginalTask(designId: string, sha256?: string): OriginalTask | null {
  const auth = useAuthStatus();
  const email = auth.kind === 'user' ? auth.email : null;
  const [tasks, setTasks] = useState<OriginalTask[]>([]);
  useEffect(() => {
    if (!email) return;
    const refresh = () => {
      void originalTasks()
        .then((all) => setTasks(all.filter((task) => task.email === email && task.designId === designId && (!sha256 || task.sha256 === sha256))))
        .catch(() => undefined);
    };
    refresh();
    void resumeOriginalUploads();
    window.addEventListener(ORIGINAL_STATUS_EVENT, refresh);
    return () => window.removeEventListener(ORIGINAL_STATUS_EVENT, refresh);
  }, [designId, email, sha256]);
  if (!email) return null;
  const visible = tasks.filter((task) => task.status !== 'cancelled');
  return visible.find((task) => task.status === 'waiting' || task.status === 'failed') ?? visible.at(-1) ?? null;
}

function OriginalState({ designId, original }: { designId: string; original?: OriginalReference }) {
  const t = zhCN.editorWorkspace.info;
  const task = useOriginalTask(designId, original?.sha256);
  if (!original) return <span className="text-ink-3">{t.originalNone}</span>;
  if (original.assetId || task?.status === 'done') return <span>{t.originalSynced}</span>;
  if (!task) return <span>{t.originalLocal}</span>;
  if (task.status === 'uploading' || task.status === 'pending') return <span>{t.originalUploading}</span>;
  if (task.status === 'waiting') return <span>{t.originalWaiting(new Date(task.retryAt!).toLocaleTimeString('zh-CN'))}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-danger">{t.originalFailed}</span>
      <Button size="sm" variant="ghost" onClick={() => void retryOriginalTask(task.key)}>{t.originalRetry}</Button>
      <Button size="sm" variant="ghost" onClick={() => void cancelOriginalTask(task.key)}>{zhCN.beadhue.cancelUpload}</Button>
    </span>
  );
}

function PackPicker({ value, onChange }: { value: number; onChange: (pack: number) => void }) {
  const t = zhCN.editorWorkspace.info;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={t.packMenu}>
      <PopoverTrigger aria-haspopup="listbox" className="-mr-2 inline-flex h-control-sm items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-ink hover:bg-bg-muted focus-visible:focus-ring [&>svg]:size-4">
        {t.pack(formatCount(value))}
        <ChevronDown aria-hidden="true" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent align="end">
        <div role="listbox" aria-label={t.packMenu} className="grid">
          {packOptions(value).map((option) => (
            <button key={option} type="button" role="option" aria-selected={option === value} className={cn(menuItemClass, 'hover:bg-bg-muted')} onClick={() => { setOpen(false); onChange(option); }}>
              {t.pack(formatCount(option))}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InfoPanel({ designId, designName, width, height, stats, total, boardSize, specLabel, paletteName, original, pack, onPackChange }: InfoPanelProps) {
  const t = zhCN.editorWorkspace.info;
  const toast = useToast();
  const [manualText, setManualText] = useState<string | null>(null);
  const list = useMemo(() => buildShoppingList(stats, pack), [pack, stats]);
  const { cols, rows, total: boards } = boardsOf(width, height, boardSize);
  const text = [t.listTitle(designName, paletteName, list.beadsPerPack), ...list.items.map((item) => t.listRow(item.code, colorName(item.hex), item.count, item.packs))].join('\n');
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setManualText(null);
      toast(t.copied, { icon: <Copy aria-hidden="true" strokeWidth={1.75} /> });
    } catch {
      setManualText(text);
    }
  };
  const facts: Array<[string, React.ReactNode]> = [
    [t.size, t.sizeValue(width, height)],
    [t.total, t.beads(formatCount(total))],
    [t.colors, t.colorsValue(stats.length)],
    [t.boards, (
      <span key="boards" className="flex items-center justify-between gap-3">
        <span className="tabular-nums">{t.boardsValue(boards, cols, rows)}</span>
        <BoardsDiagram width={width} height={height} board={boardSize} />
      </span>
    )],
    [t.spec, specLabel],
    [t.palette, <span key="palette" className="block truncate">{paletteName}</span>],
    [t.original, <OriginalState key="original" designId={designId} original={original} />],
  ];
  return (
    <>
      <PanelSection>
        <dl>
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-line py-2 last:border-b-0">
              <dt className="text-body-sm text-ink-3">{label}</dt>
              <dd className="min-w-0 text-body-sm font-medium text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </PanelSection>
      <PanelSection id="editor-shopping">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>{t.shopping}</SectionTitle>
          <PackPicker value={pack} onChange={onPackChange} />
        </div>
        {list.items.length ? (
          <>
            <table className="w-full table-fixed border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-line text-left text-caption text-ink-3">
                  <th className="w-17 pb-2 font-medium">{t.headCode}</th>
                  <th className="pb-2 font-medium">{t.headName}</th>
                  <th className="w-14 pb-2 text-right font-medium">{t.headCount}</th>
                  <th className="w-11 pb-2 text-right font-medium">{t.headPacks}</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr key={`${item.code}-${item.hex}`} className="h-9 border-b border-line text-ink-2">
                    <td><span className="inline-flex items-center gap-1.5 font-mono text-caption text-ink"><BeadSwatch hex={item.hex} size="sm" />{item.code}</span></td>
                    <td className="truncate pr-1">{colorName(item.hex)}</td>
                    <td className="text-right tabular-nums">{formatCount(item.count)}</td>
                    <td className="text-right tabular-nums">{item.packs}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="h-9 font-semibold text-ink">
                  <td colSpan={2}>{t.footer(list.colors)}</td>
                  <td className="text-right tabular-nums">{formatCount(list.total)}</td>
                  <td className="text-right tabular-nums">{list.packs}</td>
                </tr>
              </tfoot>
            </table>
            <Button block onClick={() => void copy()}>
              <Copy aria-hidden="true" strokeWidth={1.75} />
              {t.copy}
            </Button>
            {manualText !== null ? (
              <label className="grid gap-1.5 text-caption text-ink-3">
                {t.copyFailed}
                <Textarea readOnly rows={6} value={manualText} onFocus={(event) => event.currentTarget.select()} className="min-h-0 px-2 py-2 font-mono text-caption" />
              </label>
            ) : null}
          </>
        ) : (
          <p className="text-body-sm text-ink-3">{t.empty}</p>
        )}
      </PanelSection>
    </>
  );
}

export const DEFAULT_PACK = DEFAULT_BEADS_PER_PACK;
