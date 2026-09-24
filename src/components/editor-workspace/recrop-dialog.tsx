'use client';

/**
 * 已有图纸时的重新裁剪（取代旧 CropDialog）：与「新建图纸」同一个取景舞台（拖动、四角等比缩放、方向键移动），
 * 比例「原图 / 1:1 / 按底板」；确认后走工作台原来的裁剪 → 生成管线（有手工修补先确认覆盖）。手机为底部面板。
 * 解码选区期间「取消」仍可用：工作台据此作废在途的解码，迟到的结果不会改图纸。
 */
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { CropStage } from '@/components/create/crop-stage';
import { centeredCrop, ratioAspect, roundCrop, type CropRatio } from '@/components/create/create-model';
import type { Rect } from '@/lib/crop/layout';
import type { DecodedImage } from '@/lib/image/decode';
import { zhCN } from '@/messages/zh-CN';

export interface RecropDialogProps {
  image: DecodedImage;
  /** 上次确认的取景（原图自然像素）；没有就是整张图。 */
  initialRect?: Rect;
  /** 当前图纸宽度与底板边长：「按底板」让行数凑成整块板。 */
  width: number;
  boardSize: number;
  busy: boolean;
  error?: string | null;
  onConfirm: (rect: Rect) => void;
  onCancel: () => void;
  /** 叠在裁剪弹窗上的确认（「重新生成会覆盖手工修补」）：放在弹窗里才是嵌套弹窗，焦点与遮罩层级才对。 */
  children?: ReactNode;
}

const RATIOS: Array<[CropRatio, string]> = [
  ['original', zhCN.create.ratioOriginal],
  ['square', zhCN.create.ratioSquare],
  ['board', zhCN.create.ratioBoard],
];

function initialRatio(rect: Rect, natW: number, natH: number): CropRatio | null {
  if (Math.abs(rect.width - natW) < 1 && Math.abs(rect.height - natH) < 1) return 'original';
  if (Math.abs(rect.width - rect.height) < 1) return 'square';
  return null;
}

export function RecropDialog({ image, initialRect, width, boardSize, busy, error, onConfirm, onCancel, children }: RecropDialogProps) {
  const t = zhCN.create;
  const natW = image.naturalWidth ?? image.width;
  const natH = image.naturalHeight ?? image.height;
  const [crop, setCrop] = useState<Rect>(() => initialRect ?? { x: 0, y: 0, width: natW, height: natH });
  const [ratio, setRatio] = useState<CropRatio | null>(() => initialRatio(crop, natW, natH));
  const choose = (next: CropRatio) => {
    setRatio(next);
    setCrop(centeredCrop(ratioAspect(next, natW, natH, width, boardSize), natW, natH));
  };
  const cols = Math.max(1, Math.ceil(width / boardSize));
  const hint = ratio === 'board' ? t.boardCropHint(cols, Math.round(cols * ratioAspect('board', natW, natH, width, boardSize))) : t.cropHint;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{zhCN.crop.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <CropStage image={image} crop={crop} onChange={setCrop} disabled={busy} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div role="group" aria-label={t.ratioAria} className="inline-flex rounded-full bg-bg-muted p-0.75">
              {RATIOS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={ratio === id}
                  disabled={busy}
                  onClick={() => choose(id)}
                  className="h-control-sm rounded-full px-3.5 text-footnote font-medium text-ink-3 transition-colors duration-state hover:text-ink focus-visible:focus-ring aria-pressed:bg-bg aria-pressed:text-ink aria-pressed:shadow-seg"
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-caption font-normal text-ink-3">{hint}</span>
          </div>
          {error ? <FormAlert>{error}</FormAlert> : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onCancel}>{zhCN.crop.cancel}</Button>
          <Button variant="primary" loading={busy} onClick={() => onConfirm(roundCrop(crop, natW, natH))}>
            {zhCN.crop.confirm}
          </Button>
        </DialogFooter>
        {children}
      </DialogContent>
    </Dialog>
  );
}
