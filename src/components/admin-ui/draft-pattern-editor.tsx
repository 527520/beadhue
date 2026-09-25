'use client';

/**
 * 官方草稿的图纸精细编辑（admin-round-3 05）：沿用编辑器的文档事务、画布、工具栏、缩放胶囊与颜色面板，
 * 只做减法——没有整图变换 / 清空、跟拼与原图参照；换色板由批次工作室的「重映射」负责。
 */
import { useCallback, useState } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { EditorCanvas } from '@/components/editor-workspace/editor-canvas';
import { modKey, sameColor, shiftModKey, zoomPercent } from '@/components/editor-workspace/editor-model';
import { ColorsPanel } from '@/components/editor-workspace/panel-colors';
import { useEditorDocument } from '@/components/editor-workspace/use-editor-document';
import { useEditorViewport } from '@/components/editor-workspace/use-editor-viewport';
import { ToolRail, ZoomPill } from '@/components/editor-workspace/workspace-chrome';
import type { PaletteColor, Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';

type Cell = { row: number; col: number };

export function DraftPatternEditor({ pattern, palette, boardSize, onPatternChange }: {
  pattern: Pattern;
  palette: readonly PaletteColor[];
  boardSize: number;
  onPatternChange: (pattern: Pattern) => void;
}) {
  const t = zhCN.editorWorkspace;
  const doc = useEditorDocument({ pattern, palette, onPatternChange });
  const viewport = useEditorViewport(doc.width, doc.height);
  const [cursor, setCursor] = useState<Cell | null>(null);
  const [highlight, setHighlight] = useState<PaletteColor | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showSeams, setShowSeams] = useState(true);
  const [showCodes, setShowCodes] = useState(false);
  const stats = doc.state.current.stats;

  const onTap = useCallback((cell: Cell) => {
    if (doc.tool === 'fill') doc.fillAt(cell.row, cell.col);
    else if (doc.tool === 'pick') {
      if (doc.pickAt(cell.row, cell.col)) doc.setTool(doc.previousPaintTool === 'eraser' ? 'brush' : doc.previousPaintTool);
    } else if (doc.tool === 'replace') {
      const item = doc.cellAt(cell.row, cell.col);
      if (item && !item.transparent && item.code && !sameColor({ hex: item.hex ?? '', code: item.code }, doc.color)) doc.replaceCode(item.code, doc.color);
    }
  }, [doc]);
  const onApply = useCallback((cell: Cell) => {
    if (doc.tool === 'brush' || doc.tool === 'eraser') doc.commitStroke(doc.paintCell(cell.row, cell.col));
    else onTap(cell);
  }, [doc, onTap]);

  return (
    <div className="grid gap-3 lg:h-140 lg:max-h-draft-stage lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-h-0 overflow-hidden rounded-lg border border-line max-lg:h-96">
        <ToolRail tool={doc.tool} onTool={doc.setTool} brushSize={doc.brushSize} onBrushSize={doc.setBrushSize} color={doc.color} showColor={false} onShowColors={() => undefined} />
        <div className="editor-stage-dots @container relative min-h-0 min-w-0 flex-1 overflow-hidden bg-bg-subtle">
          <EditorCanvas
            doc={doc}
            viewport={viewport}
            showGrid={showGrid}
            showSeams={showSeams}
            showCodes={showCodes}
            boardSize={boardSize}
            highlight={highlight && stats.some((item) => sameColor({ hex: item.hex, code: item.code }, highlight)) ? highlight : null}
            locked={false}
            spaceHeld={false}
            cursor={cursor}
            onCursorChange={setCursor}
            onHover={() => undefined}
            onTap={onTap}
            onApply={onApply}
          />
          <div className="absolute top-3 left-3 z-10 flex gap-0.5 rounded-full bg-bg p-1 shadow-float ring-1 ring-line">
            <IconButton size="sm" label={t.undo} tooltip={`${t.undo} ${modKey()}Z`} disabled={!doc.canUndo} onClick={doc.undo}>
              <Undo2 aria-hidden="true" strokeWidth={1.75} />
            </IconButton>
            <IconButton size="sm" label={t.redo} tooltip={`${t.redo} ${shiftModKey()}Z`} disabled={!doc.canRedo} onClick={doc.redo}>
              <Redo2 aria-hidden="true" strokeWidth={1.75} />
            </IconButton>
          </div>
          <ZoomPill
            percent={zoomPercent(viewport.camera.cellPx)}
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
      </div>
      <aside aria-label={t.panel} className="min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-line bg-bg px-4 max-lg:max-h-80">
        <ColorsPanel
          color={doc.color}
          onColor={doc.setColor}
          palette={palette}
          paletteChoices={[]}
          paletteValue=""
          onPalette={() => undefined}
          stats={stats}
          highlight={highlight}
          onHighlight={setHighlight}
          onReplace={doc.replaceCode}
        />
      </aside>
    </div>
  );
}
