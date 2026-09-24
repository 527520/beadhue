'use client';

import { Check, CloudOff, TriangleAlert } from 'lucide-react';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { Table, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { relativeTime } from '@/components/create/create-model';
import { ActionMenu, type ActionEntry } from '../action-menu';
import { ProgressRing } from '../progress-ring';
import { DesignMedia, openClick, openHref } from './design-card';
import { designStateText, isStitching, type LibraryDesign } from './design-model';

const t = zhCN.me.designs;

function StatusCell({ design, cloud }: { design: LibraryDesign; cloud: boolean }) {
  const main = isStitching(design) ? (
    <span className="inline-flex items-center gap-2 text-ink-2"><ProgressRing percent={design.progress ?? 0} /><span className="tabular-nums">{t.stitchingCell(design.progress ?? 0)}</span></span>
  ) : design.published ? (
    <Badge tone="success"><Check aria-hidden="true" strokeWidth={2} />{t.badges.published}</Badge>
  ) : (
    <span className="text-ink-3">{t.states.draft}</span>
  );
  return (
    <div className="flex items-center gap-2">
      {main}
      {isStitching(design) && design.published ? <Badge tone="success"><Check aria-hidden="true" strokeWidth={2} />{t.badges.published}</Badge> : null}
      {cloud && design.status === 'conflict' ? <Badge tone="warning"><TriangleAlert aria-hidden="true" strokeWidth={2} />{t.badges.conflict}</Badge> : null}
      {cloud && design.status === 'unsynced' ? <Badge><CloudOff aria-hidden="true" strokeWidth={2} />{design.cloudPresent ? t.badges.unsynced : t.badges.localOnly}</Badge> : null}
    </div>
  );
}

/** 列表视图（原型 designTable，仅桌面）：点行任意处打开，名称是链接，「…」在行尾。 */
export function DesignTable({ designs, cloud, now, entries, onOpen }: { designs: LibraryDesign[]; cloud: boolean; now: number; entries: (design: LibraryDesign) => readonly ActionEntry[]; onOpen: (design: LibraryDesign) => void }) {
  const c = t.columns;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg">
      <Table className="table-fixed">
        <colgroup>
          <col />
          <col className="w-24" />
          <col className="w-20" />
          <col className="w-56" />
          <col className="w-28" />
          <col className="w-14" />
        </colgroup>
        <thead>
          <tr>
            <TableHead scope="col">{c.name}</TableHead>
            <TableHead scope="col">{c.size}</TableHead>
            <TableHead scope="col">{c.colors}</TableHead>
            <TableHead scope="col">{c.status}</TableHead>
            <TableHead scope="col">{c.updated}</TableHead>
            <TableHead scope="col"><span className="sr-only">{c.actions}</span></TableHead>
          </tr>
        </thead>
        <tbody>
          {designs.map((design) => (
            <TableRow
              key={design.id}
              data-row={design.id}
              className="cursor-pointer [&:last-child>td]:border-b-0"
              onClick={(event) => {
                if (!(event.target as HTMLElement).closest('a, button, [role=menu]')) onOpen(design);
              }}
            >
              <TableCell className="h-auto py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="size-12 shrink-0 overflow-hidden rounded-sm bg-bg inset-ring-1 inset-ring-line [&>*]:size-full">
                    <DesignMedia design={design} cloud={cloud} />
                  </span>
                  <a href={openHref(design)} onClick={(event) => openClick(event, () => onOpen(design))} aria-label={t.openLabel(design.name, designStateText(design, cloud))} className="min-w-0 truncate rounded-sm font-semibold text-ink hover:underline hover:underline-offset-3 focus-visible:focus-ring">
                    {design.name}
                  </a>
                </div>
              </TableCell>
              <TableCell className="h-auto py-2 whitespace-nowrap tabular-nums">{design.width > 0 ? `${design.width}×${design.height}` : '—'}</TableCell>
              <TableCell className="h-auto py-2 whitespace-nowrap tabular-nums">{design.colorCount === null ? '—' : t.colors(design.colorCount)}</TableCell>
              <TableCell className="h-auto py-2 whitespace-nowrap"><StatusCell design={design} cloud={cloud} /></TableCell>
              <TableCell className="h-auto py-2 whitespace-nowrap">{relativeTime(design.updatedAt, now) || '—'}</TableCell>
              <TableCell className="h-auto py-2 text-right">
                <ActionMenu label={zhCN.me.more(design.name)} title={design.name} entries={entries(design)} variant="default" size="sm" />
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
