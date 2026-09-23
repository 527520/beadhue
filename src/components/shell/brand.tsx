'use client';

import { cn } from '@/lib/cn';
import { BRAND_BEAD_COLORS } from '@/lib/render/beadTokens';
import { zhCN } from '@/messages/zh-CN';
import { ShellLink } from './shell-context';

const t = zhCN.shell;

/** 标志：2×2 带孔豆粒 + 圆体字标「豆色绘」+ BEADHUE（compact 时省去英文，768–1023 顶栏与手机顶栏）。 */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <ShellLink href="/" aria-label={t.brandHome} className={cn('inline-flex flex-none items-center gap-2.5 rounded-sm text-ink focus-visible:focus-ring', className)}>
      <BrandMark />
      <span className="grid leading-none">
        <b className="font-brand text-title-2 leading-none font-normal tracking-[0.04em] text-ink">{t.brandName}</b>
        {compact ? null : <small className="mt-0.75 text-micro leading-none font-semibold tracking-[0.12em] text-ink-3 uppercase max-lg:hidden">{t.brandEnglish}</small>}
      </span>
    </ShellLink>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('grid size-6 shrink-0 grid-cols-2 gap-0.5', className)}>
      {BRAND_BEAD_COLORS.map((color) => (
        <i
          key={color}
          className="relative size-2.75 rounded-full inset-ring-1 inset-ring-ink/6 after:absolute after:inset-[3.5px] after:rounded-full after:bg-bg/72 after:content-['']"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}
