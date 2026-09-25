'use client';

/**
 * 右面板「调整」：有原图时的生成参数与「重新生成」，制作规格、套装档位，旋转 / 镜像；
 * 没有原图时只显示一张说明卡和「选择原图」，不再整列灰掉。参数先在面板里改，点「重新生成」才按原图重算。
 */
import { ChevronDown, ChevronUp, Crop, FlipHorizontal2, FlipVertical2, Image as ImageIcon, ImagePlus, Info, RefreshCw, RotateCw } from 'lucide-react';
import { useMemo, useRef, useEffect, useState, type MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { SpecPicker } from '@/components/create/choice-pickers';
import type { SpecChoice } from '@/components/create/palette-choices';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { menuItemClass } from '@/components/ui/menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fieldControlClass } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { SegmentedControl } from '@/components/ui/tabs';
import { LIMITS } from '@/lib/appInfo';
import type { BoardProfileId } from '@/lib/boardProfiles';
import { patternRows } from '@/lib/engine/generate';
import type { ImageDataLike } from '@/lib/engine/types';
import type { TransformOp } from '@/lib/editor/ops';
import type { GenerationParams } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { boardWidths, boardsOf } from './editor-model';
import { FieldLabel, Hint, Note, PanelSection, SectionTitle, SwitchRow } from './editor-parts';

export interface AdjustPanelProps {
  params: GenerationParams;
  onRegenerate: (params: GenerationParams) => void;
  /** 有可用生成源（原图或刷新后恢复的本机生成源）才能重新生成。 */
  hasSource: boolean;
  source: ImageDataLike | null;
  generating: boolean;
  patternWidth: number;
  patternHeight: number;
  boardSize: number;
  specChoices: readonly SpecChoice[];
  spec: BoardProfileId;
  onSpec: (spec: BoardProfileId) => void;
  kitTiers: readonly number[];
  kitTier: number;
  paletteColorCount: number;
  onKit: (tier: number) => void;
  onTransform: (op: TransformOp) => void;
  canRecrop: boolean;
  onRecrop: () => void;
  onChooseSource: () => void;
  onFetchCommunity?: () => void;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

function paramsEqual(a: GenerationParams, b: GenerationParams): boolean {
  return a.targetWidth === b.targetWidth && a.targetColorCount === b.targetColorCount && a.dithering === b.dithering && a.mode === b.mode
    && a.brightness === b.brightness && a.contrast === b.contrast && a.backgroundRemoval === b.backgroundRemoval
    && a.bgTolerance === b.bgTolerance && (a.backgroundPrototype ?? null) === (b.backgroundPrototype ?? null);
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

function KitPicker({ tiers, value, paletteColorCount, onChange, disabled }: { tiers: readonly number[]; value: number; paletteColorCount: number; onChange: (tier: number) => void; disabled?: boolean }) {
  const t = zhCN.editorWorkspace.adjust;
  const [open, setOpen] = useState(false);
  const label = (tier: number) => (tier === 0 ? t.kitAll(paletteColorCount) : t.kitOption(tier));
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={t.kitMenu}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`${t.kit}：${label(value)}`}
        aria-haspopup="listbox"
        className={cn(fieldControlClass, 'inline-flex h-control-md cursor-pointer items-center gap-2 text-left text-body-sm [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-ink-3')}
      >
        <span className="min-w-0 flex-1 truncate">{label(value)}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent align="start">
        <div role="listbox" aria-label={t.kitMenu} className="grid">
          {tiers.map((tier) => (
            <button
              key={tier}
              type="button"
              role="option"
              aria-selected={tier === value}
              onClick={() => {
                setOpen(false);
                if (tier !== value) onChange(tier);
              }}
              className={cn(menuItemClass, 'hover:bg-bg-muted')}
            >
              <span className="min-w-0 flex-1">{label(tier)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 去背景的手动背景色：点原图预览取样（沿用旧参数面板的取样方式）。 */
function BackgroundSampler({ source, value, onChange, disabled }: { source: ImageDataLike; value: string | null | undefined; onChange: (hex: string | null) => void; disabled?: boolean }) {
  const t = zhCN.editorWorkspace.adjust;
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.min(240, source.width);
  const height = Math.max(1, Math.round((source.height * width) / source.width));
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || typeof ImageData === 'undefined') return;
    const backing = document.createElement('canvas');
    backing.width = source.width;
    backing.height = source.height;
    const bg = backing.getContext('2d');
    if (!bg) return;
    bg.putImageData(new ImageData(source.data.slice(), source.width, source.height), 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(backing, 0, 0, width, height);
  }, [height, source, width]);
  const sample = (event: MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const x = Math.min(source.width - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * source.width)));
    const y = Math.min(source.height - 1, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * source.height)));
    const index = (y * source.width + x) * 4;
    onChange(`#${[source.data[index], source.data[index + 1], source.data[index + 2]].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase());
  };
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{value ? t.bgPicked(value) : t.bgPick}</FieldLabel>
        {value ? <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>{t.bgAuto}</Button> : null}
      </div>
      <canvas ref={ref} width={width} height={height} aria-label={t.bgPickAria} role="img" onClick={sample} className="w-full cursor-crosshair rounded-md bg-bg-subtle ring-1 ring-line" />
    </div>
  );
}

export function AdjustPanel(props: AdjustPanelProps) {
  const { params, onRegenerate, hasSource, source, generating, patternWidth, patternHeight, boardSize, specChoices, spec, onSpec, kitTiers, kitTier, paletteColorCount, onKit, onTransform, canRecrop, onRecrop, onChooseSource, onFetchCommunity, advancedOpen, onAdvancedOpenChange, disabled } = props;
  const t = zhCN.editorWorkspace.adjust;
  const [base, setBase] = useState(params);
  const [local, setLocal] = useState(params);
  const [widthText, setWidthText] = useState(String(params.targetWidth));
  /** 当前会话没有完整原图时，「重新裁剪」先说明原因（与旧工作台同一规则）。 */
  const [cropHelp, setCropHelp] = useState(false);
  if (base !== params) {
    // 父级给了新的参数身份（生成成功、失败回滚、取消、恢复设计）：丢掉面板里的草稿。
    setBase(params);
    setLocal(params);
    setWidthText(String(params.targetWidth));
  }
  const patch = (next: Partial<GenerationParams>) => setLocal((current) => ({ ...current, ...next }));
  const dirty = hasSource && !paramsEqual(local, params);
  const { total: boards } = boardsOf(patternWidth, patternHeight, boardSize);
  const widthNumber = Number(widthText);
  const widthInvalid = widthText.trim() !== '' && (!Number.isInteger(widthNumber) || widthNumber < LIMITS.targetWidth.min || widthNumber > LIMITS.targetWidth.max);
  const commitWidth = () => {
    if (widthInvalid || widthText.trim() === '') {
      setWidthText(String(local.targetWidth));
      return;
    }
    patch({ targetWidth: widthNumber });
  };
  const rows = useMemo(() => (source ? patternRows(source.width, source.height, local.targetWidth) : null), [local.targetWidth, source]);
  const colorsMax = Math.min(LIMITS.targetColorCount.max, Math.max(64, local.targetColorCount));
  const locked = disabled || generating;

  const transformRow = (
    <PanelSection>
      <SectionTitle>{t.transform}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {([['rotateCW', RotateCw, t.rotate], ['mirrorH', FlipHorizontal2, t.mirrorH], ['mirrorV', FlipVertical2, t.mirrorV]] as const).map(([op, Icon, label]) => (
          <Button key={op} variant="outline" size="sm" disabled={locked} onClick={() => onTransform(op)} className="h-control-lg flex-col gap-0.5 rounded-md px-1 text-caption">
            <Icon aria-hidden="true" strokeWidth={1.75} className="m-0" />
            {label}
          </Button>
        ))}
      </div>
    </PanelSection>
  );
  const specField = (
    <div className="grid gap-2">
      <FieldLabel>{t.spec}</FieldLabel>
      <SpecPicker choices={specChoices} value={spec} onChange={onSpec} disabled={locked} label={t.spec} />
    </div>
  );

  if (!hasSource) {
    return (
      <>
        <PanelSection>
          <div className="flex gap-3 rounded-lg bg-bg-subtle p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg text-ink-3 inset-ring-1 inset-ring-line [&>svg]:size-5">
              <ImagePlus aria-hidden="true" strokeWidth={1.75} />
            </span>
            <div className="grid min-w-0 flex-1 justify-items-start gap-1">
              <h3 className="text-title-3 text-ink">{t.needSourceTitle}</h3>
              <p className="mb-2 text-body-sm text-ink-3">{t.needSourceText}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={locked} onClick={onChooseSource}>
                  <ImageIcon aria-hidden="true" strokeWidth={1.75} />
                  {zhCN.editorWorkspace.reference.choose}
                </Button>
                {onFetchCommunity ? (
                  <Button size="sm" variant="outline" disabled={locked} onClick={onFetchCommunity}>
                    {zhCN.editorWorkspace.reference.fetchCommunity}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </PanelSection>
        <PanelSection>
          {specField}
          <div className="grid gap-2">
            <FieldLabel>{t.kit}</FieldLabel>
            <KitPicker tiers={kitTiers} value={kitTier} paletteColorCount={paletteColorCount} onChange={onKit} disabled={locked} />
            <Hint>{t.kitHint}</Hint>
          </div>
        </PanelSection>
        {transformRow}
      </>
    );
  }

  return (
    <>
      <PanelSection>
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>{t.source}</SectionTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={locked}
            aria-expanded={canRecrop ? undefined : cropHelp}
            onClick={() => (canRecrop ? onRecrop() : setCropHelp((open) => !open))}
          >
            <Crop aria-hidden="true" strokeWidth={1.75} />
            {t.recrop}
          </Button>
          <Button size="sm" variant="ghost" disabled={locked} onClick={onChooseSource}>
            <ImageIcon aria-hidden="true" strokeWidth={1.75} />
            {t.reselect}
          </Button>
        </div>
        {!canRecrop && cropHelp ? <Hint>{zhCN.workbench.cropSourceMissing}</Hint> : null}
      </PanelSection>
      <PanelSection>
        <fieldset disabled={locked} className="grid min-w-0 gap-3">
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel>{t.width}</FieldLabel>
              <span className="text-caption text-ink-3 tabular-nums">{t.widthCurrent(patternWidth, patternHeight, boards)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {boardWidths(boardSize).map(({ boards: count, width }) => (
                <Chip key={width} selected={local.targetWidth === width} className="justify-center px-2" onClick={() => { patch({ targetWidth: width }); setWidthText(String(width)); }}>
                  {t.widthChip(count, width)}
                </Chip>
              ))}
            </div>
            <label className="flex items-center gap-2 text-body-sm text-ink-2">
              <Input
                type="number"
                min={LIMITS.targetWidth.min}
                max={LIMITS.targetWidth.max}
                step={1}
                inputMode="numeric"
                value={widthText}
                aria-label={t.widthAria}
                aria-invalid={widthInvalid || undefined}
                onChange={(event) => setWidthText(event.target.value)}
                onBlur={commitWidth}
                onKeyDown={(event) => { if (event.key === 'Enter') commitWidth(); }}
                className="w-22 shrink-0 tabular-nums"
              />
              <span>{t.cellUnit}</span>
              <span className="text-caption text-ink-3">{t.widthHint}</span>
            </label>
            {widthInvalid ? <p role="alert" className="text-caption font-normal text-danger">{t.widthInvalid}</p> : null}
            {rows?.clamped ? <Hint>{t.heightClamped(rows.maxWidthKeepingRatio)}</Hint> : null}
          </div>
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel>{t.colors}</FieldLabel>
              <output className="text-body-sm font-semibold text-ink tabular-nums">{t.colorsValue(local.targetColorCount)}</output>
            </div>
            <Slider aria-label={t.colors} min={LIMITS.targetColorCount.min} max={colorsMax} step={1} value={local.targetColorCount} onValueChange={(value) => patch({ targetColorCount: Array.isArray(value) ? value[0] : value })} />
          </div>
          <SwitchRow label={t.dither} hint={t.ditherHint} checked={local.dithering} onCheckedChange={(dithering) => patch({ dithering })} disabled={locked} />
          <div className="grid gap-2">
            <FieldLabel>{t.sample}</FieldLabel>
            <SegmentedControl
              label={t.sample}
              value={local.mode}
              onValueChange={(mode) => patch({ mode })}
              items={[{ value: 'dominant', label: t.sampleDominant }, { value: 'average', label: t.sampleAverage }]}
              className="flex [&>*]:flex-1"
            />
            <Hint>{local.mode === 'dominant' ? t.sampleDominantHint : t.sampleAverageHint}</Hint>
          </div>
          <div className="grid gap-3">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => onAdvancedOpenChange(!advancedOpen)}
              className="inline-flex h-8 items-center gap-1.5 justify-self-start rounded-full pr-3 pl-1 text-body-sm font-semibold text-ink hover:bg-bg-muted focus-visible:focus-ring [&>svg]:size-4.5"
            >
              {advancedOpen ? <ChevronUp aria-hidden="true" strokeWidth={1.75} /> : <ChevronDown aria-hidden="true" strokeWidth={1.75} />}
              {t.advanced}
            </button>
            {advancedOpen ? (
              <div className="grid gap-3">
                {([['brightness', t.brightness], ['contrast', t.contrast]] as const).map(([key, label]) => (
                  <div key={key} className="grid gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <FieldLabel>{label}</FieldLabel>
                      <output className="text-body-sm font-semibold text-ink tabular-nums">{signed(local[key])}</output>
                    </div>
                    <Slider aria-label={label} min={-100} max={100} step={1} value={local[key]} onValueChange={(value) => patch({ [key]: Array.isArray(value) ? value[0] : value })} />
                  </div>
                ))}
                <SwitchRow label={t.removeBg} hint={t.removeBgHint} checked={local.backgroundRemoval} onCheckedChange={(backgroundRemoval) => patch({ backgroundRemoval })} disabled={locked} />
                {local.backgroundRemoval ? (
                  <>
                    <div className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <FieldLabel>{t.tolerance}</FieldLabel>
                        <output className="text-body-sm font-semibold text-ink tabular-nums">{local.bgTolerance}</output>
                      </div>
                      <Slider aria-label={t.tolerance} min={0} max={40} step={1} value={local.bgTolerance} onValueChange={(value) => patch({ bgTolerance: Array.isArray(value) ? value[0] : value })} />
                    </div>
                    {source ? <BackgroundSampler source={source} value={local.backgroundPrototype} onChange={(backgroundPrototype) => patch({ backgroundPrototype })} disabled={locked} /> : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </fieldset>
      </PanelSection>
      <PanelSection>
        {specField}
        <div className="grid gap-2">
          <FieldLabel>{t.kit}</FieldLabel>
          <KitPicker tiers={kitTiers} value={kitTier} paletteColorCount={paletteColorCount} onChange={onKit} disabled={locked} />
          <Hint>{t.kitHint}</Hint>
        </div>
        <Button block loading={generating} disabled={locked && !generating} onClick={() => onRegenerate(local)}>
          <RefreshCw aria-hidden="true" strokeWidth={1.75} />
          {t.regenerate}
        </Button>
        {dirty ? (
          <Note icon={<Info aria-hidden="true" strokeWidth={1.75} />} className="bg-transparent p-0 text-caption text-ink-3">
            {t.dirty}
          </Note>
        ) : null}
      </PanelSection>
      {transformRow}
    </>
  );
}
