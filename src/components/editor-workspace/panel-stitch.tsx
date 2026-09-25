'use client';

/**
 * 跟拼面板：整图进度、板块总览（完成度、点击跳转）、当前行卡（颜色序列）、
 * 「完成本行」主按钮、上一行 / 下一行、回到下一处未完成。手机底部面板只保留进度、板块总览与「回到下一处未完成」。
 */
import { Check, ChevronDown, ChevronUp, MapPin, Undo2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { formatCount } from './editor-model';
import { BeadSwatch, PanelSection, SectionTitle } from './editor-parts';
import { rowRuns, type StitchRow } from './stitch-model';
import type { StitchSession } from './use-stitch-session';

const t = zhCN.editorWorkspace.stitch;

/** 行内颜色序列：色块 + 色号 + ×颗数；留空是描边胶囊。 */
export function RowRuns({ pattern, row, strip = false }: { pattern: Pattern; row: StitchRow; strip?: boolean }) {
  return (
    <ul aria-label={t.runs} className={cn('flex gap-1.5', strip ? 'flex-nowrap' : 'flex-wrap')}>
      {rowRuns(pattern, row).map((run, index) => (
        <li
          key={index}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-full text-caption whitespace-nowrap',
            run.cell ? 'bg-bg-muted pr-2 pl-1.5 text-ink-2' : 'px-2 text-ink-3 inset-ring-1 inset-ring-line-strong',
          )}
        >
          {run.cell ? (
            <>
              <BeadSwatch hex={run.cell.hex} size="sm" />
              <span className="font-mono text-ink">{run.cell.code ?? run.cell.hex}</span>
            </>
          ) : (
            t.gap
          )}
          <b className={cn('font-semibold tabular-nums', run.cell ? 'text-ink' : 'text-ink-3')}>×{run.count}</b>
        </li>
      ))}
    </ul>
  );
}

function ProgressSection({ session }: { session: StitchSession }) {
  const { stats } = session;
  return (
    <PanelSection>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-title-1 text-ink tabular-nums">{stats.percent}%</span>
        <span className="text-caption text-ink-3">{t.localOnly}</span>
      </div>
      <Progress value={stats.percent} label={t.progressAria} showLabel={false} />
      <p className="text-body-sm text-ink-3">
        {t.doneLead}
        <b className="font-semibold text-ink-2 tabular-nums">{formatCount(stats.done)}</b>
        {' / '}
        <span className="tabular-nums">{formatCount(stats.total)}</span>
        {t.doneUnit}
        {session.finished ? t.finishedNote : null}
      </p>
    </PanelSection>
  );
}

function BoardsSection({ session, onBoard }: { session: StitchSession; onBoard: (board: number) => void }) {
  const current = session.row?.board;
  // 板块多时（大图纸）格子变窄：只留序号与进度条，百分比放进可访问名称。
  const compact = session.boardCols > 4;
  return (
    <PanelSection>
      <SectionTitle count={session.boards.length}>{t.boards}</SectionTitle>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${session.boardCols}, minmax(0, 1fr))` }}>
        {session.boards.map((board, index) => {
          const empty = board.total === 0;
          const done = !empty && board.done === board.total;
          const active = index === current;
          return (
            <button
              key={index}
              type="button"
              disabled={empty}
              aria-current={active || undefined}
              aria-label={empty ? t.boardEmptyAria(index + 1) : t.boardAria(index + 1, board.percent)}
              title={compact ? (empty ? t.boardEmptyAria(index + 1) : t.boardAria(index + 1, board.percent)) : undefined}
              onClick={() => onBoard(index)}
              className={cn(
                'grid content-between gap-2 rounded-md text-left transition-shadow duration-state focus-visible:focus-ring',
                compact ? 'h-11 grid-cols-1 px-2 py-1.5' : 'h-16 grid-cols-[1fr_auto] px-3 py-2',
                active ? 'bg-bg inset-ring-2 inset-ring-ink' : done ? 'bg-success-soft inset-ring-1 inset-ring-line' : 'bg-bg-subtle inset-ring-1 inset-ring-line hover:inset-ring-ink-3',
                empty && 'bg-bg text-ink-4 hover:inset-ring-line',
              )}
            >
              <span className={cn('text-caption tabular-nums', empty ? 'text-ink-4' : 'text-ink-3')}>{index + 1}</span>
              {compact ? null : (
                <span className={cn('flex justify-end text-body-sm font-semibold tabular-nums', done ? 'text-success' : empty ? 'text-ink-4' : 'text-ink')}>
                  {empty ? t.boardEmpty : done ? <Check aria-hidden="true" strokeWidth={1.75} className="size-4" /> : `${board.percent}%`}
                </span>
              )}
              <span aria-hidden="true" className={cn('h-1 overflow-hidden rounded-full bg-bg-emphasis', !compact && 'col-span-2')}>
                <i className={cn('block h-full', done ? 'bg-success' : 'bg-ink')} style={{ width: `${board.percent}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

export interface StitchPanelProps {
  pattern: Pattern;
  session: StitchSession;
  /** 手机「跟拼进度」底部面板：不含当前行卡。 */
  sheet?: boolean;
  onBoard: (board: number) => void;
  onComplete: () => void;
  onPending: () => void;
}

export function StitchPanel({ pattern, session, sheet = false, onBoard, onComplete, onPending }: StitchPanelProps) {
  if (!session.ready) {
    return (
      <PanelSection>
        <p className="text-body-sm text-ink-3">{t.unavailable}</p>
      </PanelSection>
    );
  }
  const { row } = session;
  const pendingButton = (
    <Button block variant={sheet ? 'secondary' : 'ghost'} disabled={session.finished} onClick={onPending}>
      <MapPin aria-hidden="true" strokeWidth={1.75} />
      {t.pending}
    </Button>
  );
  return (
    <>
      <ProgressSection session={session} />
      <BoardsSection session={session} onBoard={onBoard} />
      {sheet ? (
        <PanelSection>{pendingButton}</PanelSection>
      ) : (
        <>
          <PanelSection>
            <span className="text-caption text-ink-3">{t.currentRow}</span>
            <h3 className="-mt-2 text-title-3 text-ink tabular-nums">{row ? t.rowTitle(row.board + 1, row.local + 1, row.cells.length) : t.noRows}</h3>
            {row ? <RowRuns pattern={pattern} row={row} /> : null}
            <Button block variant={session.rowDone ? 'secondary' : 'primary'} disabled={!row} onClick={onComplete}>
              {session.rowDone ? <Undo2 aria-hidden="true" strokeWidth={1.75} /> : <Check aria-hidden="true" strokeWidth={1.75} />}
              {session.rowDone ? t.undoComplete : t.complete}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={session.rowIndex <= 0} onClick={() => session.goRow(session.rowIndex - 1)}>
                <ChevronUp aria-hidden="true" strokeWidth={1.75} />
                {t.prev}
              </Button>
              <Button disabled={!row || session.rowIndex >= session.rows.length - 1} onClick={() => session.goRow(session.rowIndex + 1)}>
                {t.next}
                <ChevronDown aria-hidden="true" strokeWidth={1.75} />
              </Button>
            </div>
            {pendingButton}
          </PanelSection>
          <p className="py-3 text-caption font-normal text-ink-3">{t.hint}</p>
        </>
      )}
    </>
  );
}
