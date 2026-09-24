'use client';

/** 「从空白画布开始」弹窗（原型 create.js openBlank，D42）：尺寸芯片 + 自定义宽高、色板、制作规格。 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getBoardProfile, type BoardProfileId } from '@/lib/boardProfiles';
import { zhCN } from '@/messages/zh-CN';
import { PalettePicker, SpecPicker } from './choice-pickers';
import { BLANK_MAX, BLANK_MIN, boardWidths, boardsOf, clampInt } from './create-model';
import { findPaletteChoice, fitSpec, specChoices, type PaletteChoice } from './palette-choices';

export interface BlankCanvasSettings {
  width: number;
  height: number;
  paletteValue: string;
  boardProfile: BoardProfileId;
}

export interface BlankCanvasDialogProps {
  paletteChoices: readonly PaletteChoice[];
  paletteValue: string;
  boardProfile: BoardProfileId;
  onCreate: (settings: BlankCanvasSettings) => void;
  onClose: () => void;
}

export function BlankCanvasDialog({ paletteChoices, onCreate, onClose, ...initial }: BlankCanvasDialogProps) {
  const t = zhCN.create;
  const [boards, setBoards] = useState(2);
  const [custom, setCustom] = useState(false);
  const [paletteValue, setPaletteValue] = useState(initial.paletteValue);
  const [spec, setSpec] = useState<BoardProfileId>(initial.boardProfile);
  const [specNote, setSpecNote] = useState('');
  const board = getBoardProfile(spec).boardCols;
  const [size, setSize] = useState(() => ({ w: 2 * board, h: 2 * board }));
  const [text, setText] = useState(() => ({ w: String(2 * board), h: String(2 * board) }));
  const palette = findPaletteChoice(paletteChoices, paletteValue) ?? paletteChoices[0];
  const width = custom ? size.w : boards * board;
  const height = custom ? size.h : boards * board;

  const commit = (axis: 'w' | 'h') => {
    const parsed = Number(text[axis]);
    const next = Number.isFinite(parsed) && text[axis].trim() ? clampInt(parsed, BLANK_MIN, BLANK_MAX) : size[axis];
    setSize((current) => ({ ...current, [axis]: next }));
    setText((current) => ({ ...current, [axis]: String(next) }));
  };
  const startCustom = () => {
    setCustom(true);
    setSize({ w: width, h: height });
    setText({ w: String(width), h: String(height) });
  };
  const choosePalette = (value: string) => {
    const choice = findPaletteChoice(paletteChoices, value);
    if (!choice) return;
    const fitted = fitSpec(choice, spec);
    setPaletteValue(value);
    setSpec(fitted.spec);
    setSpecNote(fitted.note);
  };

  const numberInput = (axis: 'w' | 'h') => (
    <label className="flex items-center gap-2 text-body-sm text-ink-2">
      <Input
        type="number"
        inputMode="numeric"
        min={BLANK_MIN}
        max={BLANK_MAX}
        value={text[axis]}
        aria-label={axis === 'w' ? t.blankWidthAria : t.blankHeightAria}
        onChange={(event) => setText((current) => ({ ...current, [axis]: event.target.value }))}
        onBlur={() => commit(axis)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(axis);
        }}
        className="w-24 shrink-0"
      />
      <span>{axis === 'w' ? t.blankWidth : t.blankHeight}</span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t.blankDialogTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          <div role="group" aria-labelledby="blank-size" className="grid gap-2">
            <FieldLabel id="blank-size">{t.sizeLabel}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {boardWidths(board).map((preset) => (
                <Chip
                  key={preset.boards}
                  selected={!custom && boards === preset.boards}
                  onClick={() => {
                    setBoards(preset.boards);
                    setCustom(false);
                  }}
                >
                  {t.blankChip(preset.boards, preset.width)}
                </Chip>
              ))}
              <Chip selected={custom} onClick={startCustom}>
                {t.custom}
              </Chip>
            </div>
            {custom ? (
              <div className="flex flex-wrap items-center gap-2">
                {numberInput('w')}
                <span className="text-ink-3">×</span>
                {numberInput('h')}
                <span className="text-caption font-normal text-ink-3">{t.blankRange}</span>
              </div>
            ) : null}
            <span className="text-caption font-normal text-ink-3 tabular-nums">{t.blankSummary(width, height, boardsOf(width, height, board).total)}</span>
          </div>
          <div className="grid gap-2">
            <FieldLabel>{t.paletteLabel}</FieldLabel>
            <PalettePicker choices={paletteChoices} value={palette.value} onChange={choosePalette} />
          </div>
          <div className="grid gap-2">
            <FieldLabel>{t.specLabel}</FieldLabel>
            <SpecPicker
              choices={specChoices(palette.palette, palette.name)}
              value={spec}
              onChange={(next) => {
                setSpec(next);
                setSpecNote('');
              }}
            />
            {specNote ? <span className="text-caption font-normal text-ink-3">{specNote}</span> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button variant="primary" onClick={() => onCreate({ width, height, paletteValue: palette.value, boardProfile: spec })}>
            {t.createCanvas}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
