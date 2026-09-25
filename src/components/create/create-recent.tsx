'use client';

/**
 * 「最近的设计」：本机设计库里最近编辑的三张；一张都没有时整段不显示。
 * 卡片是普通链接（整页进入 /app?id=）：同一路由的客户端跳转不会让工作台重新恢复设计。
 */
import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { BeadImage } from '@/components/ui/bead-image';
import { openIndexedDb, parseStoredProject, type StorageAdapter } from '@/lib/storage';
import { isProgressCompatible, summarizeProgress } from '@/lib/progress/stitchProgress';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { relativeTime } from '@/lib/format';

interface RecentItem {
  id: string;
  name: string;
  pattern: Pattern;
  percent: number | null;
  activityAt: number;
  updatedAt: string;
}

export interface CreateRecentProps {
  /** 测试注入；缺省自行打开 IndexedDB，null 表示本机存储不可用。 */
  storage?: Pick<StorageAdapter, 'getAll' | 'getStitchProgress'> | null;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}

export function CreateRecent({ storage, onNavigate }: CreateRecentProps) {
  const t = zhCN.create;
  const [items, setItems] = useState<RecentItem[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (storage === null) return;
    let cancelled = false;
    void (async () => {
      const adapter = storage ?? (await openIndexedDb());
      const records = await adapter.getAll();
      const loaded = await Promise.all(
        records.map(async (record): Promise<RecentItem | null> => {
          const project = parseStoredProject(record.projectJson);
          if (!project) return null;
          const progress = await adapter.getStitchProgress(record.id).catch(() => null);
          const summary = isProgressCompatible(progress, project.pattern) ? summarizeProgress(progress, project.pattern.cells) : null;
          return {
            id: record.id,
            name: record.name,
            pattern: project.pattern,
            percent: summary && summary.doneCount > 0 ? summary.percent : null,
            activityAt: Math.max(Date.parse(record.updatedAt) || 0, summary ? Date.parse(progress!.updatedAt) || 0 : 0),
            updatedAt: record.updatedAt,
          };
        }),
      );
      if (cancelled) return;
      setNow(Date.now());
      setItems(
        loaded
          .filter((item): item is RecentItem => item !== null)
          .sort((a, b) => b.activityAt - a.activityAt || a.id.localeCompare(b.id))
          .slice(0, 3),
      );
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storage]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="create-recent" className="mt-4 grid gap-4 md:mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="create-recent" className="text-title-2">
          {t.recentTitle}
        </h2>
        <Link href="/me" onClick={(event) => onNavigate?.(event, '/me')} className="text-body-sm text-accent hover:underline focus-visible:focus-ring rounded-sm">
          {t.allDesigns}
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
        {items.map((item) => {
          const href = `/app?id=${encodeURIComponent(item.id)}&mode=${item.percent === null ? 'edit' : 'stitch'}`;
          const meta = [item.percent === null ? '' : t.recentStitching(item.percent), `${item.pattern.width}×${item.pattern.height}`, relativeTime(item.updatedAt, now)].filter(Boolean).join(' · ');
          return (
            <a
              key={item.id}
              href={href}
              aria-label={t.recentOpen(item.name)}
              className="flex min-w-0 items-center gap-3 rounded-lg p-3 inset-ring-1 inset-ring-line transition-shadow duration-state hover:inset-ring-ink-3 focus-visible:focus-ring"
            >
              <BeadImage pattern={item.pattern} className="size-14 shrink-0 rounded-md bg-bg-subtle" />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate text-body-sm font-semibold text-ink">{item.name}</span>
                <span className="truncate text-caption font-normal text-ink-3 tabular-nums">{meta}</span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
