'use client';

/**
 * 编辑器工作区（票 08，原型 editor.js）：100dvh 固定布局，无站点导航。
 * 顶栏 ｜ 左工具栏 ｜ 居中画布（尺寸胶囊、原图参照、悬停提示、缩放胶囊）｜ 右面板（颜色 / 调整 / 信息）。
 *
 * 只是界面层：图纸、生成、保存、同步、导出、分享、公开的业务都在工作台（Workbench）里，经 props 传入。
 * 编辑事务（格子副本、撤销重做、工具）在 useEditorDocument；相机在 useEditorViewport。
 * 跟拼模式与手机布局是票 09：跟拼暂时由工作台传入旧 StitchView（stitchView），手机仍用旧工作台布局。
 */
import { Copy, Download, Ellipsis, FileDown, FileUp, FilePlus2, FlipHorizontal2, FlipVertical2, Image as ImageIcon, Keyboard, Link as LinkIcon, PanelRight, Printer, Redo2, RefreshCw, RotateCw, Send, Share2, ShoppingCart, SquareDashed, Trash2, Undo2, BadgeCheck, ArrowUpRight, Hourglass, CircleAlert, Info, X, Palette } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { SegmentedControl, Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useRequireLogin } from '@/components/shell/login-dialog';
import { fitSpec, paletteSizes, type PaletteChoice, type SpecChoice } from '@/components/create/palette-choices';
import type { CloudSaveState, SaveState } from '@/components/workbench/SaveStatus';
import { getBoardProfile, type BoardProfileId } from '@/lib/boardProfiles';
import type { ImageDataLike } from '@/lib/engine/types';
import type { TransformOp } from '@/lib/editor/ops';
import type { OriginalReference } from '@/lib/originals/geometry';
import type { GenerationParams, PaletteColor, Pattern, PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { EditorCanvas } from './editor-canvas';
import { colorLabel, formatCount, modKey, sameColor, shiftModKey, toolForKey, zoomPercent, type EditorMode, type EditorTool, type PanelTab } from './editor-model';
import { PngDialog, PdfDialog } from './export-dialogs';
import { GenerationStatus } from './generation-status';
import { AdjustPanel } from './panel-adjust';
import { ColorsPanel } from './panel-colors';
import { DEFAULT_PACK, InfoPanel } from './panel-info';
import { PublishDialog, type PublishOriginal } from './publish-dialog';
import { DEFAULT_REFERENCE_BOX, ReferencePill, ReferenceWindow, type MissingReason, type ReferenceStatus } from './reference';
import { ShareLinkDialog, useCommunityStatus } from './share';
import { useEditorDocument } from './use-editor-document';
import { useEditorViewport } from './use-editor-viewport';
import { BackButton, DesignName, SaveChip, ToolRail, VerticalRule, ZoomPill } from './workspace-chrome';

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
  /** 跟拼模式的内容（票 09 之前是工作台传入的旧 StitchView）。 */
  stitchView: ReactNode;
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
  onPublishRequestHandled?: () => void;
}

type DialogKind = 'png' | 'pdf' | 'share' | 'publish' | 'shortcuts' | null;
type Cell = { row: number; col: number };

/** 键盘快捷键说明（原型 shortcutsDialog）。 */
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

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const {
    designId, name, onRename, save, mode, onModeChange, stitchView, pattern, stats, total, onPatternChange,
    palette, paletteColorCount, paletteChoices, paletteValue, paletteName, onPaletteSelect, paletteLocked, paletteNotice,
    specChoices, spec, specLabel, boardSize, onSpecSelect, kitTiers, kitTier, onKitChange,
    params, onRegenerate, hasSource, source, generating, generationProgress, generationRound, onCancelGeneration,
    original, originalImage, referenceStatus, missingReason, onOriginalChange, onChooseSource, onFetchCommunity, canRecrop, onRecrop,
    regenerationUndo, onUndoRegeneration, communityOrigin, onExportProject, cellMm, prepareShare, getOriginal,
    onBack, onNewDesign, onDuplicate, onDelete, onImportFile, notices, paletteIntent, onPaletteIntentApply, onPaletteIntentCancel,
    busy, announcement, publishRequested, onPublishRequestHandled,
  } = props;
  const toast = useToast();
  const requireLogin = useRequireLogin();
  const doc = useEditorDocument({ pattern, palette, original, onOriginalChange, onPatternChange });
  const viewport = useEditorViewport(doc.width, doc.height);
  const [tab, setTab] = useState<PanelTab>('colors');
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
  const importRef = useRef<HTMLInputElement>(null);
  const [shareSeen, setShareSeen] = useState(false);
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const community = useCommunityStatus(designId, save.loggedIn && shareSeen, communityRefresh);
  const stitch = mode === 'stitch';
  const locked = generating || Boolean(busy);
  const cellsTotal = doc.state.current.totalBeadCount;
  const liveStats = doc.state.current.stats;
  const title = name.trim() || zhCN.project.unnamed;

  // 生成成功 / 撤销 / 换色板后，高亮的颜色可能已不在图纸里。
  const shownHighlight = highlight && liveStats.some((item) => sameColor({ hex: item.hex, code: item.code }, highlight)) ? highlight : null;

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} - ${zhCN.app.name}`;
    return () => { document.title = previous; };
  }, [title]);

  const undo = useCallback(() => {
    if (locked) return;
    // 换了新图纸的那一拍 canUndo 可能还是旧值：编辑历史里没有可撤销的，就撤销上一次自动改动。
    if (doc.undo()) return;
    if (regenerationUndo) onUndoRegeneration();
  }, [doc, locked, onUndoRegeneration, regenerationUndo]);
  const redo = useCallback(() => {
    if (!locked) doc.redo();
  }, [doc, locked]);
  const canUndo = !locked && (doc.canUndo || regenerationUndo);
  const canRedo = !locked && doc.canRedo;

  const undoAction = useMemo(() => ({ label: t.undoAction, onClick: () => undo() }), [undo]);

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

  const onTap = useCallback((cell: Cell) => {
    if (locked) return;
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
  }, [doc, locked, replaceWith, toast]);

  const onApply = useCallback((cell: Cell) => {
    if (locked) return;
    if (doc.tool === 'brush' || doc.tool === 'eraser') doc.commitStroke(doc.paintCell(cell.row, cell.col));
    else onTap(cell);
    announceCursor(cell);
  }, [announceCursor, doc, locked, onTap]);

  const transform = useCallback((op: TransformOp) => {
    if (locked) return;
    doc.transform(op);
    viewport.fit();
    const [message, Icon] = op === 'rotateCW' ? [t.adjust.rotated, RotateCw] : op === 'mirrorH' ? [t.adjust.mirroredH, FlipHorizontal2] : [t.adjust.mirroredV, FlipVertical2];
    toast(message, { icon: <Icon aria-hidden="true" strokeWidth={1.75} />, action: undoAction });
  }, [doc, locked, toast, undoAction, viewport]);

  const [paletteConfirm, setPaletteConfirm] = useState<PaletteChoice | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const choosePalette = useCallback((value: string) => {
    if (value === paletteValue) return;
    const choice = paletteChoices.find((entry) => entry.value === value);
    if (choice) setPaletteConfirm(choice);
  }, [paletteChoices, paletteValue]);

  const openColors = useCallback(() => {
    setPanelOpen(true);
    setTab('colors');
  }, []);

  const openShopping = useCallback(() => {
    setPanelOpen(true);
    setTab('info');
    requestAnimationFrame(() => document.getElementById('editor-shopping')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, []);

  const startPublish = useCallback(() => {
    requireLogin(() => setDialog('publish'));
  }, [requireLogin]);

  useEffect(() => {
    if (!publishRequested) return;
    onPublishRequestHandled?.();
    if (!communityOrigin) startPublish();
  }, [communityOrigin, onPublishRequestHandled, publishRequested, startPublish]);

  // ---------- 键盘 ----------
  const keyState = useRef({ undo, redo, setTool, viewport, stitch, locked, saveNow: save.onSaveNow });
  useEffect(() => {
    keyState.current = { undo, redo, setTool, viewport, stitch, locked, saveNow: save.onSaveNow };
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
      if (overlay() || state.stitch) return;
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
      else {
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
  const hoverLabel = hover ? t.hover(hover.row + 1, hover.col + 1, describeCell(hover)) : null;
  const shareBlocked = generating;

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
          <MenuItem icon={<Send aria-hidden="true" strokeWidth={1.75} />} onClick={startPublish}>{menuNote(t.shareMenu.publish, t.shareMenu.publishNote)}</MenuItem>
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
        {!stitch ? <MenuItem danger icon={<SquareDashed aria-hidden="true" strokeWidth={1.75} />} disabled={locked || cellsTotal === 0} onClick={() => setClearOpen(true)}>{t.moreMenu.clear}</MenuItem> : null}
        <MenuItem danger icon={<Trash2 aria-hidden="true" strokeWidth={1.75} />} onClick={() => setDeleteOpen(true)}>{t.moreMenu.delete}</MenuItem>
      </MenuContent>
    </Menu>
  );

  const paletteNote = paletteConfirm ? paletteSpecNote(paletteConfirm, spec) : '';

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
          <IconButton label={t.undo} tooltip={`${t.undo} ${modKey()}Z`} disabled={stitch || !canUndo} onClick={undo}>
            <Undo2 aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <IconButton label={t.redo} tooltip={`${t.redo} ${shiftModKey()}Z`} disabled={stitch || !canRedo} onClick={redo}>
            <Redo2 aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <VerticalRule />
          {shareMenu}
          {exportMenu}
          {moreMenu}
          {!stitch ? (
            <IconButton label={panelOpen ? t.panelHide : t.panelShow} tooltip={panelOpen ? t.panelHideTip : t.panelShowTip} aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
              <PanelRight aria-hidden="true" strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
      </header>

      <div className={cn('grid min-h-0', stitch ? 'grid-cols-[minmax(0,1fr)]' : panelOpen ? 'grid-cols-[56px_minmax(0,1fr)_320px]' : 'grid-cols-[56px_minmax(0,1fr)]')}>
        {!stitch ? (
          <ToolRail tool={doc.tool} onTool={setTool} brushSize={doc.brushSize} onBrushSize={doc.setBrushSize} color={doc.color} showColor={!panelOpen} onShowColors={openColors} />
        ) : null}
        <main id="main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-col focus:outline-none">
          {stitch ? (
            <div className="min-h-0 flex-1 overflow-auto bg-bg-subtle p-4">{stitchView}</div>
          ) : (
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
              />
              <p id="editor-summary" className="sr-only">{t.summary(doc.width, doc.height, total, stats.length)}</p>
              <p role="status" className="sr-only">{announce}</p>
              <p role="status" className="sr-only">{announcement}</p>
              <span className="pointer-events-none absolute top-4 left-4 text-caption text-ink-3 tabular-nums">{t.meta(doc.width, doc.height, liveStats.length)}</span>
              {hoverLabel ? (
                <span className="pointer-events-none absolute bottom-4 left-4 z-10 inline-flex h-8 items-center rounded-full bg-bg px-3 text-caption whitespace-nowrap text-ink-2 shadow-float tabular-nums @max-[720px]:bottom-17">{hoverLabel}</span>
              ) : null}
              <div className="absolute top-4 right-4 z-10">
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
                />
              </div>
              {refOpen && referenceReady ? (
                <ReferenceWindow
                  image={originalImage}
                  original={original as OriginalReference & { geometry: NonNullable<OriginalReference['geometry']> }}
                  camera={viewport.camera}
                  viewport={viewport.size}
                  patternWidth={doc.width}
                  patternHeight={doc.height}
                  box={refBox}
                  onBoxChange={setRefBox}
                  onClose={() => setRefOpen(false)}
                />
              ) : null}
              <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-full max-w-dialog-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
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
                    className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-footnote font-medium whitespace-nowrap text-on-ink shadow-float focus-visible:focus-ring [&>svg]:size-4"
                  >
                    <span className="rounded-full ring-1.5 ring-on-ink"><span className="block size-4 rounded-full" style={{ backgroundColor: shownHighlight.hex }} /></span>
                    {t.highlight(colorLabel(shownHighlight))}
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
              />
            </div>
          )}
        </main>
        {!stitch && panelOpen ? (
          <aside aria-label={t.panel} className="flex min-h-0 flex-col border-l border-line bg-bg">
            <Tabs value={tab} onValueChange={(value) => setTab(value as PanelTab)} className="flex min-h-0 flex-1 flex-col">
              <TabsList size="sm" aria-label={t.tabs} className="shrink-0 px-5">
                <Tab size="sm" value="colors">{t.tabColors}</Tab>
                <Tab size="sm" value="adjust">{t.tabAdjust}</Tab>
                <Tab size="sm" value="info">{t.tabInfo}</Tab>
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-16">
                <TabsPanel value="colors" keepMounted>
                  <ColorsPanel
                    color={doc.color}
                    onColor={doc.setColor}
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
                  />
                </TabsPanel>
                <TabsPanel value="adjust" keepMounted>
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
                    onRecrop={onRecrop}
                    onChooseSource={onChooseSource}
                    onFetchCommunity={onFetchCommunity}
                    advancedOpen={advancedOpen}
                    onAdvancedOpenChange={setAdvancedOpen}
                    disabled={Boolean(busy)}
                  />
                </TabsPanel>
                <TabsPanel value="info" keepMounted>
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
                </TabsPanel>
              </div>
            </Tabs>
          </aside>
        ) : null}
      </div>

      <PngDialog open={dialog === 'png'} onOpenChange={(open) => setDialog(open ? 'png' : null)} pattern={pattern} designName={title} boardSize={boardSize} analyticsSource={communityOrigin ? 'community' : 'other'} />
      <PdfDialog open={dialog === 'pdf'} onOpenChange={(open) => setDialog(open ? 'pdf' : null)} pattern={pattern} stats={stats} designName={title} boardSize={boardSize} cellMm={cellMm} analyticsSource={communityOrigin ? 'community' : 'other'} />
      <ShareLinkDialog open={dialog === 'share'} onOpenChange={(open) => setDialog(open ? 'share' : null)} designId={designId} prepare={prepareShare} />
      <PublishDialog
        open={dialog === 'publish'}
        onOpenChange={(open) => setDialog(open ? 'publish' : null)}
        designId={designId}
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
    </div>
  );
}

/** 换色板确认里的规格说明：目标色板不支持当前规格时，说明会改成哪个规格。 */
function paletteSpecNote(choice: PaletteChoice, current: BoardProfileId): string {
  const { spec } = fitSpec(choice, current);
  return spec === current ? '' : t.colors.paletteSpecNote(choice.name, paletteSizes(choice.palette), getBoardProfile(spec).displayName);
}
