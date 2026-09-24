'use client';

import { Layers, Lock } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ColorUsageItem } from '@/lib/community/queries';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ColorList, Stat } from '@/components/works/detail/make-card';
import { DEFAULT_VIEW, PatternViewer, type ViewSettings, type ViewerSource } from '@/components/works/detail/pattern-viewer';

const t = zhCN.pages.share;
const d = zhCN.detail;
const iconProps = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

export interface ShareViewProps {
  name: string;
  pattern: Pattern;
  colorCount: number;
  beadCount: number;
  colorUsage: ColorUsageItem[];
  beadSize: string;
  boards: number;
  boardCols: number;
  boardRows: number;
  paletteLabel: string;
  sharedAt: string;
  /** 服务端算好的「2026年9月24日」，避免水合时区差。 */
  sharedLabel: string;
}

/**
 * 只读分享页（D38）：详情页查看器 + 制作卡的只读版——没有作者、点赞、讨论与引用；
 * 拿到链接的人本来就要照着拼，所以色号、方格与完整色号清单都开放。
 */
export function ShareView(props: ShareViewProps) {
  const { name, pattern, colorCount, beadCount, colorUsage, beadSize, boards, boardCols, boardRows, paletteLabel, sharedAt, sharedLabel } = props;
  const toast = useToast();
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [full, setFull] = useState(false);
  const source = useMemo<ViewerSource>(() => ({ kind: 'pattern', pattern }), [pattern]);
  const viewer = {
    source, width: pattern.width, height: pattern.height, boardCols, boardRows, title: name, colorCount, view,
    onViewChange: setView, onSingleBoard: () => toast(d.viewer.singleBoard),
  };

  return (
    <div data-ui="" className="page-container pt-6 max-md:pt-0">
      <div className="mx-auto grid max-w-prose grid-cols-1 gap-y-6 max-md:max-w-none max-md:gap-y-0 lg:max-w-none lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-8 xl:gap-x-12">
        <header className="grid min-w-0 justify-items-start gap-2 max-md:pt-4 lg:col-span-2">
          <Badge><Lock {...iconProps} />{t.badge}</Badge>
          <h1 id="share-title" className="min-w-0 text-title-1 text-balance text-ink">{name}</h1>
          <p className="text-body-sm text-ink-3 tabular-nums">
            {t.meta(pattern.width, pattern.height, colorCount, beadCount)}
            <span aria-hidden="true"> · </span>
            <time dateTime={sharedAt}>{t.sharedAt(sharedLabel)}</time>
          </p>
        </header>
        <div className="min-w-0 max-md:order-first max-md:-mx-gutter lg:col-start-1 lg:row-start-2">
          <PatternViewer {...viewer} onFull={() => setFull(true)} />
        </div>
        <aside aria-label={t.card} className="grid min-w-0 content-start gap-5 rounded-xl border border-line bg-bg p-6 max-md:mt-5 max-md:rounded-none max-md:border-0 max-md:border-t max-md:px-0 max-md:pt-5 max-md:pb-0 lg:sticky lg:top-[calc(var(--spacing-topbar)+24px)] lg:col-start-2 lg:row-start-2 lg:max-h-[calc(100dvh-var(--spacing-topbar)-48px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          <dl className="grid grid-cols-3 rounded-lg bg-bg-subtle py-3">
            <Stat label={d.size} value={`${pattern.width}×${pattern.height}`} unit={d.cellUnit} />
            <Stat label={d.colorsLabel} value={colorCount} unit={d.colorUnit} />
            <Stat label={d.beads} value={beadCount} unit={d.beadUnit} />
          </dl>
          <p className="-mt-2 flex items-center gap-2 text-body-sm text-ink-2">
            <Layers {...iconProps} className="size-4.5 shrink-0 text-ink-3" />
            <span>{d.spec(beadSize, boards, boardCols, boardRows)}</span>
          </p>
          <ColorList usage={colorUsage} band={[]} paletteLabel={paletteLabel} onLogin={() => {}} />
          <div className="grid gap-2">
            <Link href="/app" className={buttonVariants({ variant: 'primary', size: 'lg', block: true })}>{t.makeOwn}</Link>
            <Link href="/" className={buttonVariants({ variant: 'secondary', block: true })}>{t.discover}</Link>
            <p className="mt-1 flex gap-2 text-caption font-normal text-pretty text-ink-3">
              <Lock {...iconProps} className="mt-0.5 size-3.5 shrink-0" />
              <span>{t.note}</span>
            </p>
          </div>
        </aside>
      </div>

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent size="full" aria-label={d.viewer.fullTitle(name)} className="h-full max-h-none">
          <DialogHeader><DialogTitle>{name}</DialogTitle></DialogHeader>
          <div className="flex min-h-0 flex-1 overflow-hidden px-4 pb-4">
            {full ? <PatternViewer {...viewer} full onExit={() => setFull(false)} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
