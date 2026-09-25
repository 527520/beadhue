'use client';

/**
 * 编辑器工作区：100dvh 固定布局，无站点导航。
 * 桌面：顶栏 ｜ 左工具栏 ｜ 居中画布（尺寸胶囊、原图参照、悬停提示、缩放胶囊）｜ 右面板（颜色 / 调整 / 信息；跟拼时为跟拼面板）。
 * 手机（< 768）：顶栏「返回 ｜ 编辑 / 跟拼 ｜ 撤销 重做 ｜ …」，画布全屏，底部工具栏与最近用色；各面板以底部面板打开，原图参照为上下分屏。
 *
 * 只是界面层：图纸、生成、保存、同步、导出、分享、公开、跟拼进度的存取都在工作台（Workbench）里，经 props 传入。
 * 编辑事务在 useEditorDocument，跟拼会话在 useStitchSession，相机在 useEditorViewport。
 */
import { Copy, Download, Ellipsis, FileDown, FileUp, FilePlus2, FlipHorizontal2, FlipVertical2, Image as ImageIcon, Keyboard, Link as LinkIcon, PanelRight, Pencil, Printer, Redo2, RefreshCw, RotateCw, Send, Share2, ShoppingCart, SlidersHorizontal, SquareDashed, Trash2, TriangleAlert, Undo2, BadgeCheck, ArrowUpRight, Hourglass, CircleAlert, Info, X, Palette, Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { SegmentedControl, Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useIsMobile } from '@/components/ui/use-media-query';
import { useRequireLogin } from '@/components/shell/login-dialog';
import { fitSpec, paletteSizes, type PaletteChoice, type SpecChoice } from '@/components/create/palette-choices';
import type { CloudSaveState, SaveState } from './editor-model';
import { LIMITS } from '@/lib/appInfo';
import { getBoardProfile, type BoardProfileId } from '@/lib/boardProfiles';
import type { ImageDataLike } from '@/lib/engine/types';
import type { ToolId, TransformOp } from '@/lib/editor/ops';
import type { OriginalReference } from '@/lib/originals/geometry';
import type { StitchProgress } from '@/lib/progress/stitchProgress';
import type { GenerationParams, PaletteColor, Pattern, PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { EditorCanvas, type StitchOverlay } from './editor-canvas';
import { MOBILE_FIT_MARGINS, FIT_MARGINS, colorLabel, formatCount, modKey, sameColor, shiftModKey, toolForKey, zoomPercent, type EditorMode, type EditorTool, type PanelTab } from './editor-model';
import { PngDialog, PdfDialog } from './export-dialogs';
import { GenerationStatus } from './generation-status';
import { EditorSheet, MobileEditBar, MobileStitchBar, MobileTopBar, ProgressCapsule, StitchToolSwitch, sheetItemClass } from './mobile-chrome';
import { AdjustPanel } from './panel-adjust';
import { ColorsPanel } from './panel-colors';
import { DEFAULT_PACK, InfoPanel } from './panel-info';
import { StitchPanel } from './panel-stitch';
import { PublishDialog, type PublishOriginal } from './publish-dialog';
import { DEFAULT_REFERENCE_BOX, MissingReferenceBody, ReferencePill, ReferenceSplit, ReferenceWindow, referenceWarning, type MissingReason, type ReferenceStatus } from './reference';
import { ShareLinkDialog, useCommunityStatus } from './share';
import { boardRectAt, type StitchRow } from './stitch-model';
import { useEditorDocument } from './use-editor-document';
import { useEditorViewport } from './use-editor-viewport';
import { useStitchSession } from './use-stitch-session';
import { BackButton, DesignName, SaveChip, StitchToolRail, ToolRail, VerticalRule, ZoomPill } from './workspace-chrome';

const t = zhCN.editorWorkspace;

export interface WorkspaceNotice {
  id: string;
  tone: 'info' | 'warning' | 'danger';
  text: ReactNode;
  actions?: Array<{ label: string; onClick: () => void; primary?: boolean; disabled?: boolean }>;
  onDismiss?: () => void;
}

export interface EditorWorkspaceProps {
  designId: string;
  name: string;
  onRename: (name: string) => void;
  save: { state: SaveState; cloud: CloudSaveState; loggedIn: boolean; onRetry: () => void; onSaveNow: () => void };
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  /** 跟拼进度（本机）；null 表示本机存储不可用或还在读取。 */
  stitchProgress: StitchProgress | null;
  /** 跟拼进度变了：工作台串行写入本机（进度不进项目文件、不上云，D39）。 */
  onStitchChange: (progress: StitchProgress) => void;
  pattern: Pattern;
  stats: readonly PatternStatsItem[];
  total: number;
  onPatternChange: (pattern: Pattern) => void;
  /** 当前可用色（色板按套装档位裁剪）。 */
  palette: readonly PaletteColor[];
  paletteColorCount: number;
  paletteChoices: readonly PaletteChoice[];
  paletteValue: string;
  paletteName: string;
  /** 已确认的换色板（弹窗在工作区里）。 */
  onPaletteSelect: (value: string) => void;
  paletteLocked: boolean;
  paletteNotice?: string | null;
  specChoices: readonly SpecChoice[];
  spec: BoardProfileId;
  specLabel: string;
  boardSize: number;
  onSpecSelect: (spec: BoardProfileId) => void;
  kitTiers: readonly number[];
  kitTier: number;
  onKitChange: (tier: number) => void;
  params: GenerationParams;
  onRegenerate: (params: GenerationParams) => void;
  hasSource: boolean;
  source: ImageDataLike | null;
  generating: boolean;
  generationProgress: number | null;
  generationRound: number;
  onCancelGeneration: () => void;
  original?: OriginalReference;
  originalImage: CanvasImageSource | null;
  referenceStatus: ReferenceStatus;
  missingReason: MissingReason;
  onOriginalChange: (original: OriginalReference) => void;
  /** 选好的原图文件（界面层读文件；校验与解码在工作台）。 */
  onChooseSource: () => void;
  onFetchCommunity?: () => void;
  canRecrop: boolean;
  onRecrop: () => void;
  regenerationUndo: boolean;
  onUndoRegeneration: () => void;
  communityOrigin: boolean;
  onExportProject: () => void;
  cellMm?: number;
  prepareShare: () => Promise<boolean>;
  getOriginal: () => PublishOriginal | null;
  onBack: () => void;
  /** 编辑器里的站内链接（如色板库）：离开前先保存。 */
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNewDesign: () => void;
  onDuplicate: () => void;
  onDelete: () => Promise<boolean>;
  /** 导入另一份项目文件（成为新设计；校验在工作台）。 */
  onImportFile: (file: File) => void;
  notices: readonly WorkspaceNotice[];
  /** 从色板库带回的「把这套色板应用到这张图纸？」确认。 */
  paletteIntent: { question: string; help: string; applyLabel: string; cancelLabel: string; applyDisabled: boolean } | null;
  onPaletteIntentApply: () => void;
  onPaletteIntentCancel: () => void;
  busy?: boolean;
  /** 生成完成的读屏播报（D-1）：尺寸、颗数与颜色数。 */
  announcement?: string;
  /** /app?id=&publish=1（D72 深链）：打开后直接弹出公开弹窗。 */
  publishRequested?: boolean;
  /** 深链带 workId：公开弹窗为这件已有作品提交新修订（修改后重投）。 */
  publishWorkId?: string | null;
  onPublishRequestHandled?: () => void;
}

type DialogKind = 'png' | 'pdf' | 'share' | 'publish' | 'shortcuts' | null;
type SheetKind = 'colors' | 'more' | 'adjust' | 'info' | 'export' | 'stitch' | 'missing' | null;
type Cell = { row: number; col: number };

/** 键盘快捷键说明。 */
function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const s = t.shortcuts;
  const rows: Array<[string, string[]]> = [
    [s.hand, ['H']],
    [t.tool.brush, ['B']],
    [t.tool.eraser, ['E']],
    [t.tool.fill, ['G']],
    [t.tool.pick, ['I']],
    [t.tool.replace, ['R']],
    [t.undo, [`${modKey()}Z`]],
    [t.redo, [`${shiftModKey()}Z`]],
    [s.zoom, ['+', '−']],
    [t.fit, ['0']],
    [s.cursor, [s.arrows, s.enter]],
    [t.stitch.shortcut, ['H', 'M']],
    [s.help, ['?']],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{s.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <dl>
              {rows.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-line py-2 text-body-sm text-ink-2">
                  <dt>{label}</dt>
                  <dd className="flex gap-1">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-caption font-normal text-ink-3">{s.hint}</p>
          </DialogBody>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** 手机重命名：弹窗里改名，确认才生效。 */
function RenameDialog({ open, name, onOpenChange, onSave }: { open: boolean; name: string; onOpenChange: (open: boolean) => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) setValue(name);
  }
  const save = () => {
    const next = value.trim();
    onOpenChange(false);
    if (next && next !== name) onSave(next);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.mobile.renameTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              value={value}
              maxLength={LIMITS.designNameLength}
              aria-label={t.nameLabel}
              placeholder={zhCN.project.unnamed}
              autoFocus
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
            />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button variant="primary" onClick={save}>{t.mobile.renameSave}</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function menuNote(title: string, note: string) {
  return (
    <span className="grid py-1.5">
      <span>{title}</span>
      <span className="text-caption font-normal text-ink-3">{note}</span>
    </span>
  );
}

function NoticeCard({ notice }: { notice: WorkspaceNotice }) {
  const Icon = notice.tone === 'danger' ? CircleAlert : notice.tone === 'warning' ? CircleAlert : Info;
  return (
    <div role={notice.tone === 'danger' ? 'alert' : 'status'} className="pointer-events-auto flex w-full items-start gap-2.5 rounded-lg bg-bg px-4 py-2.5 text-body-sm text-ink-2 shadow-float ring-1 ring-line">
      <Icon aria-hidden="true" strokeWidth={1.75} className={cn('mt-0.75 size-4 shrink-0', notice.tone === 'danger' ? 'text-danger' : notice.tone === 'warning' ? 'text-warning' : 'text-ink-3')} />
      <div className="grid min-w-0 flex-1 gap-2">
        <div>{notice.text}</div>
        {notice.actions?.length ? (
          <div className="flex flex-wrap gap-2">
            {notice.actions.map((action) => (
              <Button key={action.label} size="sm" variant={action.primary ? 'primary' : 'secondary'} disabled={action.disabled} onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {notice.onDismiss ? (
        <IconButton size="sm" label={zhCN.common.close} tooltip={false} onClick={notice.onDismiss} className="-mt-1 -mr-2">
          <X aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      ) : null}
    </div>
  );
}

/** 手机「最近用色」：先放最近真正用过的颜色，不足 5 个用图纸里最多的颜色、再用色板颜色补齐；只收当前可用色。 */
function recentColors(used: readonly PaletteColor[], stats: readonly PatternStatsItem[], palette: readonly PaletteColor[]): PaletteColor[] {
  const available = (color: PaletteColor) => palette.some((entry) => sameColor(entry, color));
  const list: PaletteColor[] = [];
  const push = (color: PaletteColor) => {
    if (list.length < 5 && available(color) && !list.some((entry) => sameColor(entry, color))) list.push(color);
  };
  used.forEach(push);
  stats.forEach((item) => push({ hex: item.hex, code: item.code }));
  palette.forEach((color) => { if (color.code) push(color); });
  return list;
}

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const {
    designId, name, onRename, save, mode, onModeChange, stitchProgress, onStitchChange, pattern, stats, total, onPatternChange,
    palette, paletteColorCount, paletteChoices, paletteValue, paletteName, onPaletteSelect, paletteLocked, paletteNotice,
    specChoices, spec, specLabel, boardSize, onSpecSelect, kitTiers, kitTier, onKitChange,
    params, onRegenerate, hasSource, source, generating, generationProgress, generationRound, onCancelGeneration,
    original, originalImage, referenceStatus, missingReason, onOriginalChange, onChooseSource, onFetchCommunity, canRecrop, onRecrop,
    regenerationUndo, onUndoRegeneration, communityOrigin, onExportProject, cellMm, prepareShare, getOriginal,
    onBack, onNavigate, onNewDesign, onDuplicate, onDelete, onImportFile, notices, paletteIntent, onPaletteIntentApply, onPaletteIntentCancel,
    busy, announcement, publishRequested, publishWorkId, onPublishRequestHandled,
  } = props;
  const toast = useToast();
  const requireLogin = useRequireLogin();
  const mobile = useIsMobile();
  const [recentUsed, setRecentUsed] = useState<PaletteColor[]>([]);
  const onCommit = useCallback((label: ToolId, color: PaletteColor | null) => {
    if (!color || (label !== 'brush' && label !== 'fill' && label !== 'replace')) return;
    setRecentUsed((list) => [color, ...list.filter((entry) => !sameColor(entry, color))].slice(0, 5));
  }, []);
  const doc = useEditorDocument({ pattern, palette, original, onOriginalChange, onPatternChange, onCommit });
  const viewport = useEditorViewport(doc.width, doc.height, mobile ? MOBILE_FIT_MARGINS : FIT_MARGINS);
  const stitch = mode === 'stitch';
  const revealRow = useCallback((row: StitchRow) => {
    const rect = boardRectAt(pattern.width, pattern.height, boardSize, row.board);
    if (rect) viewport.revealRect({ x: rect.colStart, y: rect.rowStart, w: rect.width, h: rect.height });
  }, [boardSize, pattern.height, pattern.width, viewport]);
  const session = useStitchSession({
    pattern,
    boardSize,
    // 进度与图纸尺寸不一致（刚旋转、工作台还没换新进度）时先不接，免得把「已拼」错位到别的格子上。
    progress: stitchProgress && stitchProgress.width === pattern.width && stitchProgress.height === pattern.height ? stitchProgress : null,
    onChange: onStitchChange,
    defaultTool: mobile ? 'browse' : 'mark',
    onReveal: revealRow,
  });
  const [tab, setTab] = useState<PanelTab>('colors');
  // 面板首次打开才挂载，之后保持挂载（保留调整草稿）；进编辑器时只建当前页，避免一帧建三页。
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<PanelTab>>(() => new Set([tab]));
  if (!visitedTabs.has(tab)) setVisitedTabs(new Set([...visitedTabs, tab]));
  const [panelOpen, setPanelOpen] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showSeams, setShowSeams] = useState(true);
  const [showCodes, setShowCodes] = useState(true);
  const [highlight, setHighlight] = useState<PaletteColor | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell | null>(null);
  const [announce, setAnnounce] = useState('');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [refBox, setRefBox] = useState(DEFAULT_REFERENCE_BOX);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pack, setPack] = useState(DEFAULT_PACK);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [shareSeen, setShareSeen] = useState(false);
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const community = useCommunityStatus(designId, save.loggedIn && shareSeen, communityRefresh);
  const locked = generating || Boolean(busy);
  const cellsTotal = doc.state.current.totalBeadCount;
  const liveStats = doc.state.current.stats;
  const title = name.trim() || zhCN.project.unnamed;
  const recent = useMemo(() => recentColors(recentUsed, liveStats, palette), [liveStats, palette, recentUsed]);

  // 生成成功 / 撤销 / 换色板后，高亮的颜色可能已不在图纸里；跟拼时不高亮。
  const shownHighlight = !stitch && highlight && liveStats.some((item) => sameColor({ hex: item.hex, code: item.code }, highlight)) ? highlight : null;

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} - ${zhCN.app.name}`;
    return () => { document.title = previous; };
  }, [title]);

  // 手机编辑器：提示条浮到底部工具栏上方（见 theme.css）。
  useEffect(() => {
    if (!mobile) return;
    document.documentElement.dataset.mobileEditor = '';
    return () => { delete document.documentElement.dataset.mobileEditor; };
  }, [mobile]);

  // 第一次进入跟拼（含 ?mode=stitch 直达）：把当前行所在的板带进视野。
  const revealedRef = useRef(false);
  useEffect(() => {
    if (!stitch || !session.row || revealedRef.current) return;
    revealedRef.current = true;
    revealRow(session.row);
  }, [revealRow, session.row, stitch]);

  const editUndo = useCallback(() => {
    if (locked) return;
    // 换了新图纸的那一拍 canUndo 可能还是旧值：编辑历史里没有可撤销的，就撤销上一次自动改动。
    if (doc.undo()) return;
    if (regenerationUndo) onUndoRegeneration();
  }, [doc, locked, onUndoRegeneration, regenerationUndo]);
  const editRedo = useCallback(() => {
    if (!locked) doc.redo();
  }, [doc, locked]);
  const undo = stitch ? session.undo : editUndo;
  const redo = stitch ? session.redo : editRedo;
  const canUndo = stitch ? session.canUndo : !locked && (doc.canUndo || regenerationUndo);
  const canRedo = stitch ? session.canRedo : !locked && doc.canRedo;

  const undoAction = useMemo(() => ({ label: t.undoAction, onClick: () => editUndo() }), [editUndo]);
  const stitchUndo = session.undo;
  const stitchUndoAction = useMemo(() => ({ label: t.undoAction, onClick: () => { stitchUndo(); } }), [stitchUndo]);

  const setTool = useCallback((next: EditorTool) => {
    doc.setTool(next);
  }, [doc]);

  const describeCell = useCallback((cell: Cell) => {
    const item = doc.cellAt(cell.row, cell.col);
    return item && !item.transparent && item.hex ? colorLabel({ hex: item.hex, code: item.code }) : t.emptyCell;
  }, [doc]);
  /** 键盘光标的读屏播报（沿用旧编辑器的句式：光标：第 r 行 第 c 列 · 色号（回车落笔））。 */
  const announceCursor = useCallback((cell: Cell) => {
    const item = doc.cellAt(cell.row, cell.col);
    setAnnounce(zhCN.editor.cursorAt(cell.row + 1, cell.col + 1, item && !item.transparent ? (item.code ?? item.hex ?? '—') : zhCN.editor.emptyCell));
  }, [doc]);

  const onCursorChange = useCallback((cell: Cell | null, source: 'keyboard' | 'pointer') => {
    setCursor(cell);
    if (source === 'keyboard' && cell) announceCursor(cell);
  }, [announceCursor]);

  const replaceWith = useCallback((fromCode: string, target: PaletteColor | null) => {
    const count = doc.replaceCode(fromCode, target);
    if (target) setHighlight((current) => (current?.code === fromCode ? null : current));
    if (count > 0) toast(t.replaced(fromCode, target ? colorLabel(target) : t.emptyCell, formatCount(count)), { icon: <RefreshCw aria-hidden="true" strokeWidth={1.75} />, action: undoAction });
  }, [doc, toast, undoAction]);

  const markCell = useCallback((cell: Cell): boolean => {
    if (!session.toggleAt(cell.row, cell.col)) return false;
    setAnnounce(t.stitch.toggled(cell.row + 1, cell.col + 1, !session.isDone(cell.row, cell.col)));
    return true;
  }, [session]);

  const onTap = useCallback((cell: Cell) => {
    if (locked) return;
    if (stitch) {
      if (session.tool === 'mark') markCell(cell);
      return;
    }
    const item = doc.cellAt(cell.row, cell.col);
    if (doc.tool === 'fill') {
      doc.fillAt(cell.row, cell.col);
      return;
    }
    if (doc.tool === 'pick') {
      if (!doc.pickAt(cell.row, cell.col)) {
        toast(t.pickEmpty, { icon: <Info aria-hidden="true" strokeWidth={1.75} /> });
        return;
      }
      doc.setTool(doc.previousPaintTool === 'eraser' ? 'brush' : doc.previousPaintTool);
      return;
    }
    if (doc.tool === 'replace') {
      if (!item || item.transparent || !item.code) {
        toast(t.replaceEmpty, { icon: <Info aria-hidden="true" strokeWidth={1.75} /> });
        return;
      }
      if (sameColor({ hex: item.hex ?? '', code: item.code }, doc.color)) {
        toast(t.replaceSame, { icon: <Info aria-hidden="true" strokeWidth={1.75} /> });
        return;
      }
      replaceWith(item.code, doc.color);
    }
  }, [doc, locked, markCell, replaceWith, session.tool, stitch, toast]);

  const onApply = useCallback((cell: Cell) => {
    if (locked) return;
    if (stitch) {
      if (session.tool === 'mark') markCell(cell);
      return;
    }
    if (doc.tool === 'brush' || doc.tool === 'eraser') doc.commitStroke(doc.paintCell(cell.row, cell.col));
    else onTap(cell);
    announceCursor(cell);
  }, [announceCursor, doc, locked, markCell, onTap, session.tool, stitch]);

  const transform = useCallback((op: TransformOp) => {
    if (locked) return;
    doc.transform(op);
    viewport.fit();
    const [message, Icon] = op === 'rotateCW' ? [t.adjust.rotated, RotateCw] : op === 'mirrorH' ? [t.adjust.mirroredH, FlipHorizontal2] : [t.adjust.mirroredV, FlipVertical2];
    toast(message, { icon: <Icon aria-hidden="true" strokeWidth={1.75} />, action: undoAction });
  }, [doc, locked, toast, undoAction, viewport]);

  const completeRow = useCallback(() => {
    if (session.completeRow() === 'finished') toast(t.stitch.finished, { icon: <BadgeCheck aria-hidden="true" strokeWidth={1.75} /> });
  }, [session, toast]);

  const [paletteConfirm, setPaletteConfirm] = useState<PaletteChoice | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearProgressOpen, setClearProgressOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const choosePalette = useCallback((value: string) => {
    if (value === paletteValue) return;
    const choice = paletteChoices.find((entry) => entry.value === value);
    if (choice) setPaletteConfirm(choice);
  }, [paletteChoices, paletteValue]);

  const openColors = useCallback(() => {
    if (mobile) {
      setSheet('colors');
      return;
    }
    setPanelOpen(true);
    setTab('colors');
  }, [mobile]);

  const openShopping = useCallback(() => {
    setPanelOpen(true);
    setTab('info');
    if (stitch) onModeChange('edit');
    requestAnimationFrame(() => document.getElementById('editor-shopping')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [onModeChange, stitch]);

  const [reviseWorkId, setReviseWorkId] = useState<string | null>(null);
  const startPublish = useCallback((workId: string | null = null) => {
    requireLogin(() => {
      setReviseWorkId(workId);
      setDialog('publish');
    });
  }, [requireLogin]);

  /** 底部面板里的动作：先收起面板，下一拍再执行（打开的弹窗接管焦点前面板已经关好）。 */
  const fromSheet = useCallback((action: () => void) => {
    setSheet(null);
    window.setTimeout(action, 0);
  }, []);

  useEffect(() => {
    if (!publishRequested) return;
    onPublishRequestHandled?.();
    if (!communityOrigin) startPublish(publishWorkId ?? null);
  }, [communityOrigin, onPublishRequestHandled, publishRequested, publishWorkId, startPublish]);

  // ---------- 键盘 ----------
  const keyState = useRef({ undo, redo, setTool, viewport, stitch, session, locked, saveNow: save.onSaveNow });
  useEffect(() => {
    keyState.current = { undo, redo, setTool, viewport, stitch, session, locked, saveNow: save.onSaveNow };
  });
  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    const overlay = () => Boolean(document.querySelector('[data-slot="dialog-content"], [data-slot="menu"], [data-slot="popover"]'));
    const onKey = (event: KeyboardEvent) => {
      const state = keyState.current;
      if (typing(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 's') {
        event.preventDefault();
        state.saveNow();
        return;
      }
      if (overlay()) return;
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        state.redo();
        return;
      }
      if (mod || event.altKey) return;
      if (event.key === ' ') {
        if (!(event.target instanceof HTMLButtonElement)) event.preventDefault();
        if (!event.repeat) setSpaceHeld(true);
        return;
      }
      if (key === '+' || key === '=') state.viewport.zoomStep(1);
      else if (key === '-' || key === '_') state.viewport.zoomStep(-1);
      else if (key === '0') state.viewport.fit();
      else if (key === '?') setDialog('shortcuts');
      else if (state.stitch) {
        if (key === 'h') state.session.setTool('browse');
        else if (key === 'm') state.session.setTool('mark');
      } else {
        const tool = toolForKey(key);
        if (tool) state.setTool(tool);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const percent = zoomPercent(viewport.camera.cellPx);
  const referenceReady = referenceStatus === 'ready' && originalImage && original?.geometry;
  const readyOriginal = original as OriginalReference & { geometry: NonNullable<OriginalReference['geometry']> };
  const hoverLabel = hover ? `${t.hover(hover.row + 1, hover.col + 1, describeCell(hover))}${stitch && session.isDone(hover.row, hover.col) ? t.stitch.doneMark : ''}` : null;
  const shareBlocked = generating;
  const stitchOverlay = useMemo<StitchOverlay | null>(() => {
    if (!stitch || !session.progress) return null;
    const row = session.row;
    return {
      done: session.progress.done,
      board: row ? boardRectAt(pattern.width, pattern.height, boardSize, row.board) : null,
      row: row ? { row: row.row, colStart: row.colStart, colEnd: row.colEnd } : null,
      tool: session.tool,
    };
  }, [boardSize, pattern.height, pattern.width, session.progress, session.row, session.tool, stitch]);

  const publishBlocked = communityOrigin || community.kind === 'published' || community.kind === 'pending';

  const shareMenu = (
    <Menu onOpenChange={(open) => { if (open) setShareSeen(true); }}>
      <MenuTrigger aria-label={t.share} disabled={shareBlocked} className={cn(buttonVariants({ variant: 'secondary' }), 'ml-1 max-lg:w-control-md max-lg:px-0')}>
        <Share2 aria-hidden="true" strokeWidth={1.75} />
        <span className="max-lg:sr-only">{t.share}</span>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon={<LinkIcon aria-hidden="true" strokeWidth={1.75} />} onClick={() => requireLogin(() => setDialog('share'))}>
          {menuNote(t.shareMenu.copyLink, t.shareMenu.copyLinkNote)}
        </MenuItem>
        <MenuSeparator />
        {communityOrigin ? (
          <MenuItem disabled icon={<Send aria-hidden="true" strokeWidth={1.75} />}>{menuNote(t.shareMenu.publish, t.shareMenu.reuseBlocked)}</MenuItem>
        ) : community.kind === 'published' ? (
          <MenuLinkItem href={`/community/${community.workId}`} icon={<BadgeCheck aria-hidden="true" strokeWidth={1.75} />}>
            <span className="flex items-center gap-2">{menuNote(t.shareMenu.published, t.shareMenu.publishedNote)}<ArrowUpRight aria-hidden="true" strokeWidth={1.75} className="ml-auto size-4 text-ink-3" /></span>
          </MenuLinkItem>
        ) : community.kind === 'pending' ? (
          <MenuLinkItem href="/me/public" icon={<Hourglass aria-hidden="true" strokeWidth={1.75} />}>{menuNote(t.shareMenu.pending, t.shareMenu.pendingNote)}</MenuLinkItem>
        ) : (
          <MenuItem icon={<Send aria-hidden="true" strokeWidth={1.75} />} onClick={() => startPublish()}>{menuNote(t.shareMenu.publish, t.shareMenu.publishNote)}</MenuItem>
        )}
      </MenuContent>
    </Menu>
  );

  const exportMenu = (
    <Menu>
      <MenuTrigger disabled={generating} className={cn(buttonVariants({ variant: stitch ? 'secondary' : 'primary' }), 'ml-1 [&>svg:last-child]:-ml-1')}>
        <Download aria-hidden="true" strokeWidth={1.75} />
        {t.exportLabel}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m6 9 6 6 6-6" /></svg>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon={<ImageIcon aria-hidden="true" strokeWidth={1.75} />} onClick={() => setDialog('png')}>{t.exportMenu.png}</MenuItem>
        <MenuItem icon={<Printer aria-hidden="true" strokeWidth={1.75} />} onClick={() => setDialog('pdf')}>{t.exportMenu.pdf}</MenuItem>
        <MenuItem icon={<FileDown aria-hidden="true" strokeWidth={1.75} />} trail={t.exportMenu.projectTrail} onClick={onExportProject}>{t.exportMenu.project}</MenuItem>
        <MenuSeparator />
        <MenuItem icon={<ShoppingCart aria-hidden="true" strokeWidth={1.75} />} onClick={openShopping}>{t.exportMenu.shopping}</MenuItem>
      </MenuContent>
    </Menu>
  );

  const moreMenu = (
    <Menu>
      <Tooltip content={t.more}>
        <MenuTrigger aria-label={t.more} className="inline-grid size-control-md place-items-center rounded-full text-ink hover:bg-bg-muted focus-visible:focus-ring data-popup-open:bg-bg-muted [&_svg]:size-5">
          <Ellipsis aria-hidden="true" strokeWidth={1.75} />
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end">
        <MenuItem icon={<FilePlus2 aria-hidden="true" strokeWidth={1.75} />} onClick={onNewDesign}>{t.moreMenu.newDesign}</MenuItem>
        <MenuItem icon={<Copy aria-hidden="true" strokeWidth={1.75} />} disabled={locked} onClick={onDuplicate}>{t.moreMenu.duplicate}</MenuItem>
        <MenuItem icon={<FileUp aria-hidden="true" strokeWidth={1.75} />} disabled={locked} onClick={() => importRef.current?.click()}>{t.moreMenu.importProject}</MenuItem>
        <MenuItem icon={<Keyboard aria-hidden="true" strokeWidth={1.75} />} trail="?" onClick={() => setDialog('shortcuts')}>{t.moreMenu.shortcuts}</MenuItem>
        <MenuSeparator />
        {stitch ? (
          <MenuItem danger icon={<RefreshCw aria-hidden="true" strokeWidth={1.75} />} disabled={!session.hasProgress} onClick={() => setClearProgressOpen(true)}>{t.stitch.clear}</MenuItem>
        ) : (
          <MenuItem danger icon={<SquareDashed aria-hidden="true" strokeWidth={1.75} />} disabled={locked || cellsTotal === 0} onClick={() => setClearOpen(true)}>{t.moreMenu.clear}</MenuItem>
        )}
        <MenuItem danger icon={<Trash2 aria-hidden="true" strokeWidth={1.75} />} onClick={() => setDeleteOpen(true)}>{t.moreMenu.delete}</MenuItem>
      </MenuContent>
    </Menu>
  );

  const paletteNote = paletteConfirm ? paletteSpecNote(paletteConfirm, spec) : '';

  const colorsPanel = (touch: boolean) => (
    <ColorsPanel
      color={doc.color}
      onColor={touch ? (color) => { doc.setColor(color); setSheet(null); } : doc.setColor}
      palette={palette}
      paletteChoices={paletteChoices}
      paletteValue={paletteValue}
      onPalette={choosePalette}
      paletteDisabled={paletteLocked}
      paletteNotice={paletteNotice}
      stats={liveStats}
      highlight={shownHighlight}
      onHighlight={setHighlight}
      onReplace={replaceWith}
      disabled={locked}
      touch={touch}
      library={{ href: `/palettes?designId=${encodeURIComponent(designId)}`, onNavigate }}
    />
  );
  const adjustPanel = (sheetMode: boolean) => (
    <AdjustPanel
      params={params}
      onRegenerate={onRegenerate}
      hasSource={hasSource}
      source={source}
      generating={generating}
      patternWidth={doc.width}
      patternHeight={doc.height}
      boardSize={boardSize}
      specChoices={specChoices}
      spec={spec}
      onSpec={onSpecSelect}
      kitTiers={kitTiers}
      kitTier={kitTier}
      paletteColorCount={paletteColorCount}
      onKit={onKitChange}
      onTransform={transform}
      canRecrop={canRecrop}
      onRecrop={sheetMode ? () => fromSheet(onRecrop) : onRecrop}
      // 文件选择器必须在同一次点按里打开，不能延后。
      onChooseSource={sheetMode ? () => { setSheet(null); onChooseSource(); } : onChooseSource}
      onFetchCommunity={onFetchCommunity && sheetMode ? () => fromSheet(onFetchCommunity) : onFetchCommunity}
      advancedOpen={advancedOpen}
      onAdvancedOpenChange={setAdvancedOpen}
      disabled={Boolean(busy)}
    />
  );
  const infoPanel = (
    <InfoPanel
      designId={designId}
      designName={title}
      width={doc.width}
      height={doc.height}
      stats={liveStats}
      total={cellsTotal}
      boardSize={boardSize}
      specLabel={specLabel}
      paletteName={paletteName}
      original={original}
      pack={pack}
      onPackChange={setPack}
    />
  );
  const stitchPanel = (sheetMode: boolean) => (
    <StitchPanel
      pattern={pattern}
      session={session}
      sheet={sheetMode}
      onBoard={(board) => { if (sheetMode) setSheet(null); session.jumpBoard(board); }}
      onComplete={completeRow}
      onPending={() => { if (sheetMode) setSheet(null); session.jumpPending(); }}
    />
  );

  const noticeStack = (
    <div className={cn('pointer-events-none absolute left-1/2 z-10 flex w-full max-w-dialog-sm -translate-x-1/2 flex-col items-center gap-2 px-4', mobile ? 'top-13' : 'top-3')}>
      {generating ? (
        <div className="pointer-events-auto">
          <GenerationStatus key={generationRound} progress={generationProgress} onCancel={onCancelGeneration} />
        </div>
      ) : null}
      {shownHighlight ? (
        <button
          type="button"
          aria-label={t.clearHighlight(colorLabel(shownHighlight))}
          onClick={() => setHighlight(null)}
          className="pointer-events-auto inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-ink px-3.5 text-footnote font-medium whitespace-nowrap text-on-ink shadow-float focus-visible:focus-ring [&>svg]:size-4"
        >
          <span className="rounded-full ring-1.5 ring-on-ink"><span className="block size-4 rounded-full" style={{ backgroundColor: shownHighlight.hex }} /></span>
          <span className="truncate">{t.highlight(colorLabel(shownHighlight))}</span>
          <X aria-hidden="true" strokeWidth={1.75} />
        </button>
      ) : null}
      {notices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)}
      {paletteIntent ? (
        <NoticeCard
          notice={{
            id: 'palette-intent',
            tone: 'info',
            text: (
              <>
                <p className="text-ink">{paletteIntent.question}</p>
                <p className="text-caption font-normal text-ink-3">{paletteIntent.help}</p>
              </>
            ),
            actions: [
              { label: paletteIntent.applyLabel, primary: true, disabled: paletteIntent.applyDisabled, onClick: onPaletteIntentApply },
              { label: paletteIntent.cancelLabel, onClick: onPaletteIntentCancel },
            ],
          }}
        />
      ) : null}
    </div>
  );

  const stage = (
    <div className="editor-stage-dots @container relative min-h-0 flex-1 overflow-hidden bg-bg-subtle">
      <EditorCanvas
        doc={doc}
        viewport={viewport}
        showGrid={showGrid}
        showSeams={showSeams}
        showCodes={showCodes}
        boardSize={boardSize}
        highlight={shownHighlight}
        locked={locked}
        spaceHeld={spaceHeld}
        cursor={cursor}
        onCursorChange={onCursorChange}
        onHover={setHover}
        onTap={onTap}
        onApply={onApply}
        describedBy="editor-summary"
        autoFocus
        stitch={stitchOverlay}
        continuousTouch={continuous}
        label={stitch ? t.stitch.canvasAria(doc.width, doc.height, session.stats.percent) : undefined}
      />
      <p id="editor-summary" className="sr-only">{t.summary(doc.width, doc.height, total, stats.length)}</p>
      <p role="status" className="sr-only">{announce}</p>
      <p role="status" className="sr-only">{announcement}</p>
      {mobile && (stitch || hoverLabel) ? null : (
        <span className={cn('pointer-events-none absolute text-caption text-ink-3 tabular-nums', mobile ? 'top-3 left-3' : 'top-4 left-4')}>{t.meta(doc.width, doc.height, liveStats.length)}</span>
      )}
      {hoverLabel ? (
        <span className={cn('pointer-events-none absolute z-10 inline-flex h-8 items-center rounded-full bg-bg px-3 text-caption whitespace-nowrap text-ink-2 shadow-float tabular-nums', mobile ? 'top-2 left-2' : 'bottom-4 left-4 @max-canvas-compact:bottom-17')}>{hoverLabel}</span>
      ) : null}
      {mobile && stitch ? null : (
        <div className={cn('absolute z-10', mobile ? 'top-2 right-3' : 'top-4 right-4')}>
          <ReferencePill
            status={referenceStatus}
            reason={missingReason}
            open={refOpen}
            image={originalImage}
            original={original}
            onToggle={() => setRefOpen(true)}
            onChooseSource={onChooseSource}
            onFetchCommunity={onFetchCommunity}
            busy={locked}
            compact={mobile}
          />
        </div>
      )}
      {!mobile && refOpen && referenceReady ? (
        <ReferenceWindow
          image={originalImage}
          original={readyOriginal}
          camera={viewport.camera}
          viewport={viewport.size}
          patternWidth={doc.width}
          patternHeight={doc.height}
          box={refBox}
          onBoxChange={setRefBox}
          onClose={() => setRefOpen(false)}
        />
      ) : null}
      {noticeStack}
      {mobile && stitch && session.ready ? (
        <>
          <ProgressCapsule session={session} onOpen={() => setSheet('stitch')} />
          <StitchToolSwitch tool={session.tool} onTool={session.setTool} className="absolute bottom-3 left-3 z-10" />
        </>
      ) : null}
      <ZoomPill
        percent={percent}
        cellPx={viewport.camera.cellPx}
        onZoomIn={() => viewport.zoomStep(1)}
        onZoomOut={() => viewport.zoomStep(-1)}
        onFit={viewport.fit}
        onPreset={viewport.zoomToPercent}
        showGrid={showGrid}
        showSeams={showSeams}
        showCodes={showCodes}
        onToggle={(key) => (key === 'grid' ? setShowGrid((value) => !value) : key === 'seams' ? setShowSeams((value) => !value) : setShowCodes((value) => !value))}
        compact={mobile}
      />
    </div>
  );

  const dialogs = (
    <>
      <PngDialog open={dialog === 'png'} onOpenChange={(open) => setDialog(open ? 'png' : null)} pattern={pattern} designName={title} boardSize={boardSize} analyticsSource={communityOrigin ? 'community' : 'other'} />
      <PdfDialog open={dialog === 'pdf'} onOpenChange={(open) => setDialog(open ? 'pdf' : null)} pattern={pattern} stats={stats} designName={title} boardSize={boardSize} cellMm={cellMm} analyticsSource={communityOrigin ? 'community' : 'other'} />
      <ShareLinkDialog open={dialog === 'share'} onOpenChange={(open) => setDialog(open ? 'share' : null)} designId={designId} prepare={prepareShare} />
      <PublishDialog
        open={dialog === 'publish'}
        onOpenChange={(open) => setDialog(open ? 'publish' : null)}
        designId={designId}
        workId={reviseWorkId ?? undefined}
        designName={title}
        pattern={pattern}
        getOriginal={getOriginal}
        hasOriginal={Boolean(getOriginal())}
        prepare={prepareShare}
        onChooseSource={onChooseSource}
        onSubmitted={() => setCommunityRefresh((value) => value + 1)}
      />
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={zhCN.project.importInputLabel}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onImportFile(file);
        }}
      />
      <ShortcutsDialog open={dialog === 'shortcuts'} onOpenChange={(open) => setDialog(open ? 'shortcuts' : null)} />

      <Dialog open={paletteConfirm !== null} onOpenChange={(open) => { if (!open) setPaletteConfirm(null); }}>
        {paletteConfirm ? (
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{t.colors.paletteTitle(paletteConfirm.name)}</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              <p className="text-body-sm text-ink-2">{t.colors.paletteText}</p>
              {paletteNote ? <p className="flex items-start gap-2 rounded-md bg-bg-subtle p-3 text-body-sm text-ink-2"><Palette aria-hidden="true" strokeWidth={1.75} className="mt-0.75 size-4 shrink-0 text-ink-3" />{paletteNote}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setPaletteConfirm(null)}>{t.cancel}</Button>
              <Button variant="primary" onClick={() => { const value = paletteConfirm.value; setPaletteConfirm(null); onPaletteSelect(value); }}>{t.colors.paletteOk}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        {clearOpen ? (
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{t.moreMenu.clearTitle}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body-sm text-ink-2">{t.moreMenu.clearText}</p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setClearOpen(false)}>{t.cancel}</Button>
              <Button variant="danger" onClick={() => { setClearOpen(false); if (doc.clear() > 0) toast(t.moreMenu.cleared, { action: undoAction }); }}>{t.moreMenu.clearOk}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={clearProgressOpen} onOpenChange={setClearProgressOpen}>
        {clearProgressOpen ? (
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{t.stitch.clearTitle}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body-sm text-ink-2">{t.stitch.clearText}</p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setClearProgressOpen(false)}>{t.cancel}</Button>
              <Button variant="danger" onClick={() => { setClearProgressOpen(false); if (session.clear()) toast(t.stitch.cleared, { icon: <RefreshCw aria-hidden="true" strokeWidth={1.75} />, action: stitchUndoAction }); }}>{t.stitch.clearOk}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        {deleteOpen ? (
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{t.moreMenu.deleteTitle}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body-sm text-ink-2">{t.moreMenu.deleteText(title)}</p>
            </DialogBody>
            <DialogFooter>
              <Button disabled={deleting} onClick={() => setDeleteOpen(false)}>{t.cancel}</Button>
              <Button
                variant="danger"
                loading={deleting}
                onClick={() => {
                  setDeleting(true);
                  void onDelete().then((ok) => {
                    setDeleting(false);
                    if (ok) setDeleteOpen(false);
                  });
                }}
              >
                {t.moreMenu.deleteOk}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );

  if (mobile) {
    const warning = referenceWarning(referenceStatus, missingReason);
    const referenceAvailable = referenceStatus === 'ready' || referenceStatus === 'loading';
    const icon = (Icon: typeof Copy) => <Icon aria-hidden="true" strokeWidth={1.75} />;
    return (
      <div data-ui="" className="fixed inset-0 grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)_auto] bg-bg">
        <MobileTopBar
          mode={mode}
          onModeChange={onModeChange}
          onBack={onBack}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onMore={() => { setShareSeen(true); setSheet('more'); }}
        />
        <main id="main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-col focus:outline-none">
          {refOpen && referenceReady ? (
            <ReferenceSplit
              image={originalImage}
              original={readyOriginal}
              camera={viewport.camera}
              viewport={viewport.size}
              patternWidth={doc.width}
              patternHeight={doc.height}
              onClose={() => setRefOpen(false)}
            />
          ) : null}
          {stage}
        </main>
        {stitch ? (
          <MobileStitchBar pattern={pattern} session={session} onComplete={completeRow} />
        ) : (
          <MobileEditBar
            tool={doc.tool}
            onTool={setTool}
            brushSize={doc.brushSize}
            onBrushSize={doc.setBrushSize}
            continuous={continuous}
            onContinuous={setContinuous}
            color={doc.color}
            recent={recent}
            onPickRecent={doc.setColor}
            onOpenColors={openColors}
          />
        )}

        <EditorSheet open={sheet === 'colors'} onOpenChange={(open) => setSheet(open ? 'colors' : null)} title={t.mobile.colorsSheet}>{colorsPanel(true)}</EditorSheet>
        <EditorSheet open={sheet === 'adjust'} onOpenChange={(open) => setSheet(open ? 'adjust' : null)} title={t.mobile.adjust}>{adjustPanel(true)}</EditorSheet>
        <EditorSheet open={sheet === 'info'} onOpenChange={(open) => setSheet(open ? 'info' : null)} title={t.mobile.info}>{infoPanel}</EditorSheet>
        <EditorSheet open={sheet === 'stitch'} onOpenChange={(open) => setSheet(open ? 'stitch' : null)} title={t.stitch.sheet}>{stitchPanel(true)}</EditorSheet>
        <EditorSheet open={sheet === 'missing'} onOpenChange={(open) => setSheet(open ? 'missing' : null)} title={warning ? t.reference.missingPill : t.reference.addPill}>
          <MissingReferenceBody status={referenceStatus} reason={missingReason} busy={locked} onChooseSource={onChooseSource} onFetchCommunity={onFetchCommunity} onDone={() => setSheet(null)} />
        </EditorSheet>
        <EditorSheet open={sheet === 'export'} onOpenChange={(open) => setSheet(open ? 'export' : null)} title={t.mobile.export}>
          <div role="group" aria-label={t.mobile.export} className="grid">
            <button type="button" className={sheetItemClass} disabled={generating} onClick={() => fromSheet(() => setDialog('png'))}>{icon(ImageIcon)}{t.exportMenu.png}</button>
            <button type="button" className={sheetItemClass} disabled={generating} onClick={() => fromSheet(() => setDialog('pdf'))}>{icon(Printer)}{t.exportMenu.pdf}</button>
            <button type="button" className={sheetItemClass} disabled={generating} onClick={() => fromSheet(onExportProject)}>
              {icon(FileDown)}
              <span className="min-w-0 flex-1">{t.exportMenu.project}</span>
              <span className="text-caption font-normal text-ink-3">{t.exportMenu.projectTrail}</span>
            </button>
          </div>
        </EditorSheet>
        <EditorSheet open={sheet === 'more'} onOpenChange={(open) => setSheet(open ? 'more' : null)} title={title}>
          <div className="-mt-1 mb-2 flex items-center justify-between">
            <SaveChip state={save.state} cloud={save.cloud} loggedIn={save.loggedIn} onRetry={save.onRetry} labelled />
            <Button size="sm" variant="ghost" onClick={() => fromSheet(() => setRenameOpen(true))}>
              <Pencil aria-hidden="true" strokeWidth={1.75} />
              {t.mobile.rename}
            </Button>
          </div>
          <div role="group" aria-label={t.more} className="grid">
            <button type="button" className={sheetItemClass} onClick={() => setSheet('adjust')}>{icon(SlidersHorizontal)}{t.mobile.adjust}</button>
            <button type="button" className={sheetItemClass} onClick={() => setSheet('info')}>{icon(Info)}{t.mobile.info}</button>
            <button type="button" className={sheetItemClass} onClick={() => setSheet('export')}>{icon(Download)}{t.mobile.export}</button>
            <button type="button" className={sheetItemClass} disabled={shareBlocked} onClick={() => fromSheet(() => requireLogin(() => setDialog('share')))}>{icon(Share2)}{t.mobile.shareLink}</button>
            <button type="button" className={sheetItemClass} disabled={publishBlocked || shareBlocked} onClick={() => fromSheet(() => startPublish())}>
              {icon(Send)}
              <span className="grid min-w-0 flex-1">
                <span>{t.mobile.publish}</span>
                {communityOrigin ? <span className="text-caption font-normal text-ink-3">{t.shareMenu.reuseBlocked}</span> : community.kind === 'published' ? <span className="text-caption font-normal text-ink-3">{t.mobile.publishedNote}</span> : community.kind === 'pending' ? <span className="text-caption font-normal text-ink-3">{t.mobile.pendingNote}</span> : null}
              </span>
            </button>
            {referenceAvailable ? (
              <button type="button" className={sheetItemClass} disabled={referenceStatus === 'loading'} onClick={() => { setSheet(null); setRefOpen((open) => !open); }}>
                {icon(ImageIcon)}
                {refOpen ? t.mobile.referenceClose : t.mobile.reference}
              </button>
            ) : (
              <button type="button" className={cn(sheetItemClass, warning && 'text-warning [&>svg]:text-warning')} onClick={() => setSheet('missing')}>
                {icon(warning ? TriangleAlert : ImageIcon)}
                {warning ? t.reference.missingPill : t.reference.addPill}
              </button>
            )}
          </div>
          <div role="separator" className="mx-1 my-1.5 h-px bg-line" />
          <div role="group" aria-label={t.mobile.display} className="grid gap-2 px-2.5 pb-2">
            <span className="pt-1 text-caption text-ink-3">{t.mobile.display}</span>
            <div className="flex flex-wrap gap-2">
              {([['grid', t.grid, showGrid, setShowGrid], ['seams', t.seams, showSeams, setShowSeams], ['codes', t.codes, showCodes, setShowCodes]] as const).map(([key, label, on, set]) => (
                <Chip key={key} selected={on} icon={on ? <Check aria-hidden="true" strokeWidth={1.75} /> : undefined} onClick={() => set((value: boolean) => !value)}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          <div role="separator" className="mx-1 my-1.5 h-px bg-line" />
          <div className="grid">
            <button type="button" className={sheetItemClass} onClick={() => fromSheet(onNewDesign)}>{icon(FilePlus2)}{t.moreMenu.newDesign}</button>
            <button type="button" className={sheetItemClass} disabled={locked} onClick={() => fromSheet(onDuplicate)}>{icon(Copy)}{t.moreMenu.duplicate}</button>
            <button type="button" className={sheetItemClass} disabled={locked} onClick={() => fromSheet(() => importRef.current?.click())}>{icon(FileUp)}{t.moreMenu.importProject}</button>
            {stitch ? (
              <button type="button" className={cn(sheetItemClass, 'text-danger [&>svg]:text-danger')} disabled={!session.hasProgress} onClick={() => fromSheet(() => setClearProgressOpen(true))}>{icon(RefreshCw)}{t.stitch.clear}</button>
            ) : (
              <button type="button" className={cn(sheetItemClass, 'text-danger [&>svg]:text-danger')} disabled={locked || cellsTotal === 0} onClick={() => fromSheet(() => setClearOpen(true))}>{icon(SquareDashed)}{t.moreMenu.clear}</button>
            )}
            <button type="button" className={cn(sheetItemClass, 'text-danger [&>svg]:text-danger')} onClick={() => fromSheet(() => setDeleteOpen(true))}>{icon(Trash2)}{t.moreMenu.delete}</button>
          </div>
        </EditorSheet>
        <RenameDialog open={renameOpen} name={name} onOpenChange={setRenameOpen} onSave={(next) => { onRename(next); toast(t.renamed); }} />
        {dialogs}
      </div>
    );
  }

  return (
    <div data-ui="" className="fixed inset-0 grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] bg-bg">
      <header className="relative z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-3 border-b border-line bg-bg px-3">
        <div className="flex min-w-0 items-center gap-1">
          <BackButton onBack={onBack} />
          <DesignName name={name} onRename={onRename} onRenamed={() => toast(t.renamed)} />
          <SaveChip state={save.state} cloud={save.cloud} loggedIn={save.loggedIn} onRetry={save.onRetry} />
        </div>
        <SegmentedControl<EditorMode>
          label={t.mode}
          value={mode}
          onValueChange={onModeChange}
          items={[{ value: 'edit', label: t.modeEdit }, { value: 'stitch', label: t.modeStitch }]}
          className="[&>*]:px-5 max-lg:[&>*]:px-3"
        />
        <div className="flex items-center justify-end gap-1">
          <IconButton label={t.undo} tooltip={`${t.undo} ${modKey()}Z`} disabled={!canUndo} onClick={undo}>
            <Undo2 aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <IconButton label={t.redo} tooltip={`${t.redo} ${shiftModKey()}Z`} disabled={!canRedo} onClick={redo}>
            <Redo2 aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <VerticalRule />
          {shareMenu}
          {exportMenu}
          {moreMenu}
          <IconButton label={panelOpen ? t.panelHide : t.panelShow} tooltip={panelOpen ? t.panelHideTip : t.panelShowTip} aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
            <PanelRight aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        </div>
      </header>

      <div className={cn('grid min-h-0', panelOpen ? 'grid-cols-[56px_minmax(0,1fr)_320px]' : 'grid-cols-[56px_minmax(0,1fr)]')}>
        {stitch ? (
          <StitchToolRail tool={session.tool} onTool={session.setTool} />
        ) : (
          <ToolRail tool={doc.tool} onTool={setTool} brushSize={doc.brushSize} onBrushSize={doc.setBrushSize} color={doc.color} showColor={!panelOpen} onShowColors={openColors} />
        )}
        <main id="main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-col focus:outline-none">
          {stage}
        </main>
        {panelOpen && stitch ? (
          <aside aria-label={t.panel} className="flex min-h-0 flex-col border-l border-line bg-bg">
            <div className="flex h-10.25 shrink-0 items-center border-b border-line px-5">
              <h2 className="text-title-3 text-ink">{t.stitch.title}</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-16">{stitchPanel(false)}</div>
          </aside>
        ) : panelOpen ? (
          <aside aria-label={t.panel} className="flex min-h-0 flex-col border-l border-line bg-bg">
            <Tabs value={tab} onValueChange={(value) => setTab(value as PanelTab)} className="flex min-h-0 flex-1 flex-col">
              <TabsList size="sm" aria-label={t.tabs} className="shrink-0 px-5">
                <Tab size="sm" value="colors">{t.tabColors}</Tab>
                <Tab size="sm" value="adjust">{t.tabAdjust}</Tab>
                <Tab size="sm" value="info">{t.tabInfo}</Tab>
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-16">
                <TabsPanel value="colors" keepMounted>
                  {visitedTabs.has('colors') ? colorsPanel(false) : null}
                </TabsPanel>
                <TabsPanel value="adjust" keepMounted>
                  {visitedTabs.has('adjust') ? adjustPanel(false) : null}
                </TabsPanel>
                <TabsPanel value="info" keepMounted>
                  {visitedTabs.has('info') ? infoPanel : null}
                </TabsPanel>
              </div>
            </Tabs>
          </aside>
        ) : null}
      </div>
      {dialogs}
    </div>
  );
}

/** 换色板确认里的规格说明：目标色板不支持当前规格时，说明会改成哪个规格。 */
function paletteSpecNote(choice: PaletteChoice, current: BoardProfileId): string {
  const { spec } = fitSpec(choice, current);
  return spec === current ? '' : t.colors.paletteSpecNote(choice.name, paletteSizes(choice.palette), getBoardProfile(spec).displayName);
}
