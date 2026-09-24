'use client';

/**
 * 「新建图纸」弹窗（原型 create.js openNewDrawing）：左取景（原图 / 1:1 / 按底板），
 * 右设置（宽度芯片 + 自定义、颜色数、色板、制作规格、去背景）与结果预览；底部固定「取消」「生成图纸」。
 * 手机由 Dialog 自动变底部面板，按钮吸底。生成本身交给工作台管线，这里只收集设置并显示进度。
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldLabel, FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/checkbox';
import { BeadImage } from '@/components/ui/bead-image';
import { getBoardProfile, type BoardProfileId } from '@/lib/boardProfiles';
import type { Rect } from '@/lib/crop/layout';
import type { DecodedImage } from '@/lib/image/decode';
import type { GenerationParams } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { PalettePicker, SpecPicker } from './choice-pickers';
import { CropStage } from './crop-stage';
import {
  boardWidths,
  boardsOf,
  centeredCrop,
  clampInt,
  patternHeight,
  ratioAspect,
  roundCrop,
  WIDTH_MAX,
  WIDTH_MIN,
  type CropRatio,
} from './create-model';
import { findPaletteChoice, fitSpec, specChoices, type PaletteChoice } from './palette-choices';
import { disposePreviewWorker, usePatternPreview } from './use-pattern-preview';

export interface NewDrawingSettings {
  rect: Rect;
  width: number;
  colors: number;
  paletteValue: string;
  boardProfile: BoardProfileId;
  removeBackground: boolean;
}

export interface NewDrawingDialogProps {
  image: DecodedImage;
  /** 默认参数（站点配置的默认宽度与颜色数、当前草稿的色板与规格）。 */
  params: GenerationParams;
  paletteValue: string;
  boardProfile: BoardProfileId;
  paletteChoices: readonly PaletteChoice[];
  colorRange: { min: number; max: number };
  /** 解码选区 / 生成进行中：设置锁定，底部显示进度。 */
  working: boolean;
  /** 0–100；null 表示还在准备图片或进度未知。 */
  progress: number | null;
  error?: string | null;
  onGenerate: (settings: NewDrawingSettings) => void;
  /** 生成中点「取消」：停止生成、留在弹窗。 */
  onCancelGeneration: () => void;
  /** 关闭弹窗、放弃这张图片。 */
  onClose: () => void;
}

const RATIOS: Array<[CropRatio, string]> = [
  ['original', zhCN.create.ratioOriginal],
  ['square', zhCN.create.ratioSquare],
  ['board', zhCN.create.ratioBoard],
];

const fmt = (value: number) => value.toLocaleString('zh-CN');

export function NewDrawingDialog(props: NewDrawingDialogProps) {
  const { image, paletteChoices, working, progress, error, onGenerate, onCancelGeneration, onClose } = props;
  const t = zhCN.create;
  const natW = image.naturalWidth ?? image.width;
  const natH = image.naturalHeight ?? image.height;
  const [ratio, setRatio] = useState<CropRatio>('original');
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: natW, height: natH });
  const [width, setWidth] = useState(() => clampInt(props.params.targetWidth, WIDTH_MIN, WIDTH_MAX));
  const [widthText, setWidthText] = useState(String(width));
  const [colors, setColors] = useState(() => clampInt(props.params.targetColorCount, props.colorRange.min, props.colorRange.max));
  const [paletteValue, setPaletteValue] = useState(props.paletteValue);
  const [spec, setSpec] = useState<BoardProfileId>(props.boardProfile);
  const [specNote, setSpecNote] = useState('');
  const [removeBackground, setRemoveBackground] = useState(props.params.backgroundRemoval);
  const board = getBoardProfile(spec);
  const presets = boardWidths(board.boardCols);
  const [custom, setCustom] = useState(() => !presets.some((preset) => preset.width === width));

  const palette = findPaletteChoice(paletteChoices, paletteValue) ?? paletteChoices[0];
  const height = patternHeight(width, crop);
  const boards = boardsOf(width, height, board.boardCols);

  const reframe = (nextRatio: CropRatio, nextWidth: number, nextBoard: number) => {
    setCrop(centeredCrop(ratioAspect(nextRatio, natW, natH, nextWidth, nextBoard), natW, natH));
  };
  const chooseRatio = (next: CropRatio) => {
    setRatio(next);
    reframe(next, width, board.boardCols);
  };
  const chooseWidth = (next: number, isCustom: boolean) => {
    setWidth(next);
    setWidthText(String(next));
    setCustom(isCustom);
    if (ratio === 'board') reframe('board', next, board.boardCols);
  };
  const choosePalette = (value: string) => {
    const choice = findPaletteChoice(paletteChoices, value);
    if (!choice) return;
    const fitted = fitSpec(choice, spec);
    setPaletteValue(value);
    setSpec(fitted.spec);
    setSpecNote(fitted.note);
    if (ratio === 'board') reframe('board', width, getBoardProfile(fitted.spec).boardCols);
  };
  const chooseSpec = (next: BoardProfileId) => {
    setSpec(next);
    setSpecNote('');
    if (ratio === 'board') reframe('board', width, getBoardProfile(next).boardCols);
  };
  const commitWidthText = () => {
    const parsed = Number(widthText);
    chooseWidth(Number.isFinite(parsed) && widthText.trim() ? clampInt(parsed, WIDTH_MIN, WIDTH_MAX) : width, true);
  };

  const previewParams = useMemo<GenerationParams>(
    () => ({ ...props.params, targetWidth: width, targetColorCount: colors, backgroundRemoval: removeBackground }),
    [props.params, width, colors, removeBackground],
  );
  const preview = usePatternPreview(image, crop, previewParams, palette?.colors ?? []);
  useEffect(() => () => disposePreviewWorker(), []);

  const boardCols = Math.max(1, Math.ceil(width / board.boardCols));
  const cropHint = ratio === 'board' ? t.boardCropHint(boardCols, Math.round(boardCols * ratioAspect('board', natW, natH, width, board.boardCols))) : t.cropHint;

  const generate = () =>
    onGenerate({ rect: roundCrop(crop, natW, natH), width, colors, paletteValue: palette.value, boardProfile: spec, removeBackground });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        if (working) onCancelGeneration();
        onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t.newTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4 md:grid-cols-new-drawing md:gap-6">
          <div className="grid min-w-0 content-start gap-3">
            <CropStage image={image} crop={crop} onChange={setCrop} disabled={working} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div role="group" aria-label={t.ratioAria} className="inline-flex rounded-full bg-bg-muted p-0.75">
                {RATIOS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={ratio === id}
                    disabled={working}
                    onClick={() => chooseRatio(id)}
                    className="h-control-sm rounded-full px-3.5 text-footnote font-medium text-ink-3 transition-colors duration-state hover:text-ink focus-visible:focus-ring aria-pressed:bg-bg aria-pressed:text-ink aria-pressed:shadow-seg"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-caption font-normal text-ink-3">{cropHint}</span>
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-5">
            <div className="flex items-center gap-4 rounded-lg bg-bg-subtle p-3">
              <div className="grid size-22 shrink-0 place-items-center overflow-hidden rounded-md bg-bg inset-ring-1 inset-ring-line md:size-28">
                {preview ? <BeadImage pattern={preview.pattern} mode="flat" pad={0.04} lazy={false} alt={t.previewAlt} className="size-full" /> : null}
              </div>
              <div className="grid min-w-0 gap-0.5">
                <span className="text-caption text-ink-3">{t.previewLabel}</span>
                <b className="text-title-3 text-ink tabular-nums">{t.previewSize(width, height)}</b>
                <span className="text-body-sm text-ink-3 tabular-nums">
                  {preview ? t.previewMeta(`${board.beadDiameterMm}mm`, fmt(preview.beads), preview.colors) : '\u00a0'}
                </span>
              </div>
            </div>

            <div role="group" aria-labelledby="new-drawing-width" className="grid gap-2">
              <FieldLabel id="new-drawing-width">{t.widthLabel}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Chip key={preset.boards} selected={!custom && width === preset.width} disabled={working} onClick={() => chooseWidth(preset.width, false)}>
                    {t.widthChip(preset.boards, preset.width)}
                  </Chip>
                ))}
                <Chip selected={custom} disabled={working} onClick={() => setCustom(true)}>
                  {t.custom}
                </Chip>
              </div>
              {custom ? (
                <label className="flex items-center gap-2 text-body-sm text-ink-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={WIDTH_MIN}
                    max={WIDTH_MAX}
                    value={widthText}
                    disabled={working}
                    aria-label={t.customWidthAria}
                    onChange={(event) => setWidthText(event.target.value)}
                    onBlur={commitWidthText}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitWidthText();
                    }}
                    className="w-24 shrink-0"
                  />
                  <span>{t.cellUnit}</span>
                  <span className="text-caption font-normal text-ink-3">{t.widthRange}</span>
                </label>
              ) : null}
              <span className="text-caption font-normal text-ink-3 tabular-nums">{t.sizeSummary(width, height, boards.cols, boards.rows, boards.total)}</span>
            </div>

            <div className="grid gap-2" data-base-ui-swipe-ignore="">
              <div className="flex items-baseline justify-between gap-2">
                <FieldLabel id="new-drawing-colors">{t.colorsLabel}</FieldLabel>
                <output className="text-body-sm font-semibold text-ink tabular-nums">{t.colorsValue(colors)}</output>
              </div>
              <Slider
                aria-label={t.colorsLabel}
                min={props.colorRange.min}
                max={props.colorRange.max}
                value={colors}
                disabled={working}
                onValueChange={(value) => setColors(Array.isArray(value) ? value[0] : value)}
              />
              <span className="text-caption font-normal text-ink-3">{t.colorsHint}</span>
            </div>

            <div className="grid gap-2">
              <FieldLabel>{t.paletteLabel}</FieldLabel>
              <PalettePicker choices={paletteChoices} value={palette.value} onChange={choosePalette} disabled={working} />
            </div>
            <div className="grid gap-2">
              <FieldLabel>{t.specLabel}</FieldLabel>
              <SpecPicker choices={specChoices(palette.palette, palette.name)} value={spec} onChange={chooseSpec} disabled={working} />
              {specNote ? <span className="text-caption font-normal text-ink-3">{specNote}</span> : null}
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-footnote font-medium text-ink">{t.removeBg}</span>
                <span className="text-caption font-normal text-ink-3">{t.removeBgHint}</span>
              </span>
              <Switch checked={removeBackground} disabled={working} onCheckedChange={setRemoveBackground} aria-label={t.removeBg} />
            </label>
          </div>
        </DialogBody>
        <DialogFooter className="items-center">
          {working ? (
            <Progress
              value={progress ?? 0}
              label={progress === null ? t.preparing : t.generatingLabel}
              className="mr-auto hidden w-48 md:grid"
            />
          ) : error ? (
            <FormAlert className="mr-auto self-center">{error}</FormAlert>
          ) : null}
          <Button variant="secondary" onClick={working ? onCancelGeneration : onClose}>
            {t.cancel}
          </Button>
          <Button variant="primary" loading={working} onClick={generate}>
            {t.generate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
