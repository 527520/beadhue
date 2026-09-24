'use client';

import { Check, ChevronDown, Download, Info, Layers, Lock, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { ColorUsageItem } from '@/lib/community/queries';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const t = zhCN.detail;
const iconProps = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

export interface MakeCardProps {
  width: number;
  height: number;
  colorCount: number;
  beadCount: number;
  /** 「5mm」 */
  beadSize: string;
  boards: number;
  boardCols: number;
  boardRows: number;
  paletteLabel: string;
  /** 登录后的色号清单；未登录为 null（D53）。 */
  colorUsage: ColorUsageItem[] | null;
  /** 未登录时清单模糊层用的豆色（列表缩略图的色带）。 */
  colorBand: string[];
  loggedIn: boolean;
  downloading: boolean;
  onMake: () => void;
  onDownload: () => void;
  onLogin: () => void;
}

/** 一颗带孔的小圆豆（色号清单行首）。 */
function Bead({ hex }: { hex: string }) {
  return (
    <i aria-hidden="true" className="relative size-5 rounded-full inset-ring-1 inset-ring-ink/12 after:absolute after:inset-1.75 after:rounded-full after:bg-bg/72 after:content-['']" style={{ backgroundColor: hex }} />
  );
}

const rowClass = 'grid min-h-9 grid-cols-[20px_36px_minmax(0,1fr)_auto] items-center gap-x-3 text-body-sm text-ink-2';

function ColorList({ usage, band, paletteLabel, onLogin }: { usage: ColorUsageItem[] | null; band: string[]; paletteLabel: string; onLogin: () => void }) {
  const [open, setOpen] = useState(false);
  const head = (
    <div className="mb-2 flex min-w-0 items-baseline gap-3">
      <h2 id="detail-colors-title" className="shrink-0 text-title-3 text-ink">{t.colorList}</h2>
      <span className="ml-auto min-w-0 truncate text-caption font-normal text-ink-3">{paletteLabel}</span>
    </div>
  );
  if (!usage) {
    const widths = ['w-16', 'w-12', 'w-18', 'w-14', 'w-10', 'w-15'];
    return (
      <section aria-labelledby="detail-colors-title" className="grid min-w-0">
        {head}
        <div className="relative">
          <ul aria-hidden="true" className="grid blur-[3px] select-none">
            {band.slice(0, 6).map((hex, index) => (
              <li key={`${hex}-${index}`} className={rowClass}>
                <Bead hex={hex} />
                <span className="block h-2.5 w-7 rounded-full bg-bg-emphasis" />
                <span className={cn('block h-2.5 max-w-full rounded-full bg-bg-emphasis', widths[index])} />
                <span className="block h-2.5 w-11 justify-self-end rounded-full bg-bg-emphasis" />
              </li>
            ))}
          </ul>
          <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 bg-bg/45 p-4 text-center">
            <p className="flex items-center gap-2 text-body-sm font-medium text-ink"><Lock {...iconProps} className="size-4" />{t.colorsLocked}</p>
            <Button size="sm" variant="outline" onClick={onLogin}>{t.login}</Button>
          </div>
        </div>
      </section>
    );
  }
  const count = usage.length;
  return (
    <section aria-labelledby="detail-colors-title" className="grid min-w-0">
      {head}
      <ul id="detail-color-list" className="grid">
        {usage.map((color, index) => (
          <li key={`${color.code}-${color.hex}`} className={cn(rowClass, !open && index >= 6 && 'hidden', !open && index === 5 && 'max-md:hidden')}>
            <Bead hex={color.hex} />
            <span className="font-mono font-semibold text-ink">{color.code || '—'}</span>
            <span className="truncate">{color.name}</span>
            <span className="text-right whitespace-nowrap text-ink-3 tabular-nums">{t.beadCount(color.count)}</span>
          </li>
        ))}
      </ul>
      {count > 5 ? (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls="detail-color-list"
          onClick={() => setOpen((value) => !value)}
          className={cn('mt-1 -ml-3 justify-self-start [&_svg]:transition-transform [&_svg]:duration-state aria-expanded:[&_svg]:rotate-180', count === 6 && 'md:hidden')}
        >
          <span>{open ? t.collapse : t.showAllColors(count)}</span>
          <ChevronDown {...iconProps} />
        </Button>
      ) : null}
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: ReactNode; unit: string }) {
  return (
    <div className="grid min-w-0 justify-items-center px-2 text-center not-first:border-l not-first:border-line">
      <dt className="order-1 text-caption font-normal text-ink-3">{label}</dt>
      <dd className="text-title-2 whitespace-nowrap text-ink tabular-nums">{value}<small className="ml-1 text-body-sm text-ink-3">{unit}</small></dd>
    </div>
  );
}

/** 许可全文：桌面弹出层，手机底部面板。 */
function LicensePopover() {
  const list = (items: readonly string[], allowed: boolean) => items.map((item) => (
    <li key={item} className="flex items-start gap-2">
      {allowed ? <Check {...iconProps} className="mt-0.75 size-4 shrink-0 text-success" /> : <X {...iconProps} className="mt-0.75 size-4 shrink-0 text-danger" />}
      <span>{item}</span>
    </li>
  ));
  return (
    <Popover sheetTitle={t.licenseTitle}>
      <PopoverTrigger render={<IconButton size="sm" label={t.licenseInfo} tooltip={t.licenseTip} tooltipSide="top" className="text-ink-3 hover:text-ink"><Info {...iconProps} className="size-4" /></IconButton>} />
      <PopoverContent aria-label={t.licenseTitle} className="w-80">
        <div className="grid gap-3 px-3 pt-3 pb-2 max-md:p-0">
          <h3 className="text-title-3 text-ink max-md:hidden">{t.licenseTitle}</h3>
          <p className="text-body-sm text-ink-2">{t.licenseBody}</p>
          <ul className="grid gap-2 text-body-sm text-ink-2">
            {list(t.licenseAllow, true)}
            {list(t.licenseDeny, false)}
          </ul>
          <Link href="/community/copyright" className="text-body-sm text-accent hover:underline">{t.licenseMore}</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * 吸顶制作卡（原型 makeCard）：三格统计、规格与底板数、色号清单、主按钮「用这张制作」（< 1024 由吸底栏承担）、
 * 下载图纸 PNG、一行许可 + 全文弹出层。
 */
export function MakeCard(props: MakeCardProps) {
  const { width, height, colorCount, beadCount, beadSize, boards, boardCols, boardRows, paletteLabel, colorUsage, colorBand, loggedIn, downloading, onMake, onDownload, onLogin } = props;
  return (
    <aside aria-label={t.card} className="grid min-w-0 content-start gap-5 rounded-xl border border-line bg-bg p-6 max-md:mt-5 max-md:rounded-none max-md:border-0 max-md:border-t max-md:px-0 max-md:pt-5 max-md:pb-0 lg:sticky lg:top-[calc(var(--spacing-topbar)+24px)] lg:max-h-[calc(100dvh-var(--spacing-topbar)-48px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
      <dl className="grid grid-cols-3 rounded-lg bg-bg-subtle py-3">
        <Stat label={t.size} value={`${width}×${height}`} unit={t.cellUnit} />
        <Stat label={t.colorsLabel} value={colorCount} unit={t.colorUnit} />
        <Stat label={t.beads} value={beadCount} unit={t.beadUnit} />
      </dl>
      <p className="-mt-2 flex items-center gap-2 text-body-sm text-ink-2">
        <Layers {...iconProps} className="size-4.5 shrink-0 text-ink-3" />
        <span>{t.spec(beadSize, boards, boardCols, boardRows)}</span>
      </p>
      <ColorList usage={colorUsage} band={colorBand} paletteLabel={paletteLabel} onLogin={onLogin} />
      <div className="grid gap-2">
        <Button variant="primary" size="lg" block onClick={onMake} className="max-lg:hidden">{loggedIn ? t.make : t.loginToMake}</Button>
        <Button variant="secondary" block loading={downloading} onClick={onDownload}>
          <Download {...iconProps} />
          {t.download}
        </Button>
        <p className="flex items-center justify-center gap-1 text-caption font-normal text-ink-3">
          <ShieldCheck {...iconProps} className="size-4" />
          <span>{t.license}</span>
          <LicensePopover />
        </p>
      </div>
    </aside>
  );
}
