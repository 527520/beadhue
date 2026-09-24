'use client';

import { ArrowUpDown, Check, ChevronDown, ChevronUp, Download, Ellipsis, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { PageSize } from '@/lib/admin/pagination';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/field';
import { IconButton, iconButtonVariants } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, menuItemClass } from '@/components/ui/menu';
import { Pagination } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import type { FilterState, FilterValue } from './use-admin-table';

const t = zhCN.adminUi.table;

export interface Column<T> {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  align?: 'end';
  /** 列排序（只作用于当前页，服务端按各自默认顺序分页）。 */
  sort?: (a: T, b: T) => number;
  /** 主列：可聚焦的标题按钮所在列，文字可截断。 */
  main?: boolean;
  className?: string;
}

export interface FilterDef { key: string; label: string; options: ReadonlyArray<{ value: string; label: string }>; multi?: boolean }

export interface RowAction { id: string; label: string; icon: ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void }
export type RowMenuEntry = RowAction | 'separator';

export interface RowCard { lead?: ReactNode; title: string; meta?: ReactNode; tail?: ReactNode }

export interface DataTableProps<T> {
  label: string;
  rows: T[];
  rowId: (row: T) => string;
  rowName: (row: T) => string;
  columns: Column<T>[];
  card: (row: T) => RowCard;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  filters?: FilterDef[];
  filterValues?: FilterState;
  onFilterChange?: (key: string, value: FilterValue) => void;
  onExport?: () => Promise<number>;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** 批量操作按钮（选中行后替换工具条）。 */
  batchActions?: ReactNode;
  menu?: (row: T) => RowMenuEntry[];
  onOpen?: (row: T) => void;
  openId?: string | null;
  page: number;
  pageCount: number;
  total: number;
  size: PageSize;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
  filtered: boolean;
  onReset: () => void;
  emptyTitle?: string;
  emptyText?: string;
  /** 表格最小宽度（px），窄于它时横向滚动；手机统一变卡片列表。 */
  minWidth?: number;
}

const isActive = (value: FilterValue | undefined) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

function FilterButton({ filter, value, onChange }: { filter: FilterDef; value: FilterValue | undefined; onChange: (value: FilterValue) => void }) {
  const [open, setOpen] = useState(false);
  const on = isActive(value);
  const picked = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={t.filterBy(filter.label)}>
      <PopoverTrigger render={<Button size="sm" variant="outline" className={cn('[&_svg]:text-ink-3', on && 'border-ink')} />}>
        {filter.label}
        {on ? <span className="inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink px-1.25 text-caption leading-none font-semibold text-on-ink tabular-nums">{filter.multi ? picked.size : 1}</span> : null}
        <ChevronDown aria-hidden="true" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t.filterBy(filter.label)}>
        {filter.multi ? (
          <div role="group" aria-label={t.filterBy(filter.label)} className="grid min-w-55 gap-1.5">
            <div className="grid max-h-75 overflow-y-auto">
              {filter.options.map((option) => (
                <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-menu-item px-2.5 text-body-sm text-ink hover:bg-bg-muted">
                  <Checkbox checked={picked.has(option.value)} onCheckedChange={(checked) => {
                    const next = new Set(picked);
                    if (checked) next.add(option.value); else next.delete(option.value);
                    onChange([...next]);
                  }} />
                  <span className="min-w-0 flex-1">{option.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-between gap-2 border-t border-line px-1 pt-1.5 pb-0.5 max-md:[&>*]:h-control-md max-md:[&>*]:flex-1">
              <Button size="sm" variant="ghost" disabled={!picked.size} onClick={() => { onChange([]); setOpen(false); }}>{t.clear}</Button>
              <Button size="sm" className="md:hidden" onClick={() => setOpen(false)}>{t.done}</Button>
            </div>
          </div>
        ) : (
          <div role="menu" aria-label={t.filterBy(filter.label)} className="grid min-w-50">
            {[{ value: '', label: t.all }, ...filter.options].map((option) => {
              const checked = (Array.isArray(value) ? '' : value ?? '') === option.value;
              return (
                <button key={option.value || 'all'} type="button" role="menuitemradio" aria-checked={checked}
                  className={cn(menuItemClass, 'hover:bg-bg-muted focus-visible:bg-bg-muted', checked && 'font-semibold')}
                  onClick={() => { onChange(option.value); setOpen(false); }}>
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {checked ? <Check aria-hidden="true" strokeWidth={1.75} className="ml-auto text-ink" /> : <span className="w-4.5" />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RowMenu({ name, entries }: { name: string; entries: RowMenuEntry[] }) {
  return (
    <Menu>
      <Tooltip content={t.more} side="top">
        <MenuTrigger aria-label={t.rowMenu(name)} className={cn(iconButtonVariants({ size: 'sm' }), 'hover:bg-bg-muted')} onClick={(event) => event.stopPropagation()}>
          <Ellipsis aria-hidden="true" strokeWidth={1.75} />
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end">
        {entries.map((entry, index) => entry === 'separator'
          ? <MenuSeparator key={`sep-${index}`} />
          : <MenuItem key={entry.id} icon={entry.icon} danger={entry.danger} disabled={entry.disabled} onClick={entry.onSelect}>{entry.label}</MenuItem>)}
      </MenuContent>
    </Menu>
  );
}

/** 主列单元格：缩略图 / 头像 + 可聚焦的标题按钮 + 小号副信息（原型 cells.js titleCell）。 */
export function TitleCell({ lead, title, sub, extra, onOpen, quote }: { lead?: ReactNode; title: string; sub?: ReactNode; extra?: ReactNode; onOpen?: () => void; quote?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {lead}
      <div className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          {onOpen ? (
            <button type="button" data-open="" onClick={(event) => { event.stopPropagation(); onOpen(); }}
              className={cn('min-w-0 truncate rounded-sm text-left text-body-sm font-semibold text-ink hover:underline hover:underline-offset-3 focus-visible:focus-ring', quote ? 'max-w-80 font-medium' : 'max-w-60')}>
              {title}
            </button>
          ) : <span className={cn('min-w-0 truncate text-body-sm font-semibold text-ink', quote ? 'max-w-80 font-medium' : 'max-w-60')}>{title}</span>}
          {extra}
        </span>
        {sub ? <span className="text-caption font-normal text-ink-3">{sub}</span> : null}
      </div>
    </div>
  );
}

/**
 * 后台通用数据表格（原型 admin/table.js）：工具条（搜索 / 筛选 / 导出）⇄ 批量操作条、表格（手机为卡片列表）、
 * 行点击打开右侧抽屉、底部通栏单行分页（总数 · 每页 · 页码 · 跳页；窄屏简化）。
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const { label, rows, rowId, rowName, columns, card, loading, error, onRetry, search, filters = [], filterValues = {}, onFilterChange, onExport,
    selectable = false, selected = [], onSelectedChange, batchActions, menu, onOpen, openId, page, pageCount, total, size, onPage, onSize,
    filtered, onReset, emptyTitle, emptyText, minWidth = 760 } = props;
  const toast = useToast();
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const sorted = useMemo(() => {
    const column = sort ? columns.find((item) => item.key === sort.key) : null;
    if (!column?.sort) return rows;
    return [...rows].sort((a, b) => column.sort!(a, b) * (sort!.dir === 'asc' ? 1 : -1));
  }, [rows, columns, sort]);
  const selectedSet = new Set(selected);
  const onPageIds = sorted.map(rowId);
  const allOnPage = onPageIds.length > 0 && onPageIds.every((id) => selectedSet.has(id));
  const someOnPage = onPageIds.some((id) => selectedSet.has(id));
  const setAll = (checked: boolean) => onSelectedChange?.(checked ? [...new Set([...selected, ...onPageIds])] : selected.filter((id) => !onPageIds.includes(id)));
  const toggle = (id: string, checked: boolean) => onSelectedChange?.(checked ? [...selected, id] : selected.filter((item) => item !== id));
  const hasSelection = selectable && selected.length > 0;
  const runExport = async () => {
    if (!onExport) return;
    setExporting(true);
    try { toast(t.exported(await onExport()), { icon: <Download aria-hidden="true" strokeWidth={1.75} /> }); }
    catch { toast(t.exportFailed); }
    finally { setExporting(false); }
  };
  const clickRow = (event: React.MouseEvent, row: T) => {
    if ((event.target as HTMLElement).closest('a, button, input, label, [role=checkbox], [role=menuitem]')) return;
    onOpen?.(row);
  };

  const toolbar = (
    <div className={cn('flex min-h-14.25 items-center gap-2 border-b border-line px-4 py-3 max-md:flex-wrap max-md:p-3', hasSelection && 'md:hidden')}>
      {search ? (
        <SearchField value={search.value} onValueChange={search.onChange} placeholder={search.placeholder} aria-label={search.placeholder} autoComplete="off"
          onKeyDown={(event) => { if (event.key === 'Escape' && search.value) { event.stopPropagation(); search.onChange(''); } }}
          wrapperClassName="h-control-sm w-70 shrink pr-1 pl-3 max-md:h-control-md max-md:w-full max-md:basis-full" className="text-body-sm" />
      ) : null}
      {filters.length ? (
        <div role="group" aria-label={t.filter} className="flex min-w-0 gap-2 max-md:flex-1 max-md:overflow-x-auto max-md:[scrollbar-width:none]">
          {filters.map((filter) => <FilterButton key={filter.key} filter={filter} value={filterValues[filter.key]} onChange={(value) => onFilterChange?.(filter.key, value)} />)}
        </div>
      ) : null}
      <span className="min-w-0 flex-1 max-md:hidden" />
      {onExport ? (
        <Button size="sm" variant="ghost" loading={exporting} onClick={() => void runExport()}>
          <Download aria-hidden="true" strokeWidth={1.75} />{t.export}<span className="max-md:hidden">{t.exportCsv}</span>
        </Button>
      ) : null}
    </div>
  );

  const batchBar = hasSelection ? (
    <div className="flex min-h-14.25 items-center gap-2 rounded-t-lg border-b border-line bg-bg-subtle px-4 py-3 max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:z-45 max-md:min-h-14 max-md:rounded-lg max-md:border-0 max-md:bg-bg max-md:py-2 max-md:pr-2 max-md:pl-4 max-md:shadow-dialog max-md:ring-1 max-md:ring-line">
      <span className="max-md:hidden"><Checkbox aria-label={t.selectPageShort} checked={allOnPage} indeterminate={someOnPage && !allOnPage} onCheckedChange={(checked) => setAll(Boolean(checked))} /></span>
      <span aria-live="polite" className="mr-2 text-body-sm font-medium whitespace-nowrap text-ink">{t.selected(selected.length)}</span>
      <span className="flex gap-2 max-md:gap-1.5 max-md:[&_svg]:hidden">{batchActions}</span>
      <span className="min-w-0 flex-1" />
      <Button size="sm" variant="ghost" className="max-md:hidden" onClick={() => onSelectedChange?.([])}>{t.clearSelection}</Button>
      <IconButton size="sm" label={t.clearSelection} tooltip={false} className="md:hidden" onClick={() => onSelectedChange?.([])}><X aria-hidden="true" strokeWidth={1.75} /></IconButton>
    </div>
  ) : null;

  let body: ReactNode;
  if (error && !rows.length) {
    body = <div className="grid justify-items-start gap-3 p-5"><FormAlert>{error}</FormAlert><Button size="sm" onClick={onRetry}>{t.retry}</Button></div>;
  } else if (loading && !rows.length) {
    body = <div role="status" aria-label={t.loading} className="grid gap-3 p-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10" />)}</div>;
  } else if (!rows.length) {
    body = filtered
      ? <EmptyState compact kind="search" title={t.emptyFiltered} description={t.emptyFilteredText} actions={<Button onClick={onReset}>{t.reset}</Button>} className="py-12" />
      : <EmptyState compact title={emptyTitle ?? t.emptyTitle} description={emptyText} className="py-12" />;
  } else {
    body = (
      <>
        {error ? <div className="flex items-center gap-3 border-b border-line px-5 py-2"><FormAlert>{error}</FormAlert><Button size="sm" variant="ghost" onClick={onRetry}>{t.retry}</Button></div> : null}
        <div className="overflow-x-auto max-md:hidden" aria-busy={loading || undefined}>
          <table className="w-full border-collapse text-body-sm" style={{ minWidth }}>
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr>
                {selectable ? <th scope="col" className="h-10 w-13 border-b border-line bg-bg pr-0 pl-5"><Checkbox aria-label={t.selectPage(sorted.length)} checked={allOnPage} indeterminate={someOnPage && !allOnPage} onCheckedChange={(checked) => setAll(Boolean(checked))} /></th> : null}
                {columns.map((column, index) => {
                  const dir = sort?.key === column.key ? sort.dir : null;
                  const Icon = dir === 'asc' ? ChevronUp : dir === 'desc' ? ChevronDown : ArrowUpDown;
                  return (
                    <th key={column.key} scope="col" aria-sort={column.sort ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                      className={cn('h-10 border-b border-line bg-bg px-3 text-left font-medium whitespace-nowrap text-ink-3', column.align === 'end' && 'text-right', index === 0 && !selectable && 'pl-5', index === columns.length - 1 && !menu && 'pr-5')}>
                      {column.sort ? (
                        <button type="button" title={t.sortPageOnly}
                          onClick={() => setSort(dir === null ? { key: column.key, dir: 'desc' } : dir === 'desc' ? { key: column.key, dir: 'asc' } : null)}
                          className={cn('inline-flex items-center gap-1 rounded-sm hover:text-ink focus-visible:focus-ring [&>svg]:size-4', dir ? 'text-ink' : '[&>svg]:text-ink-4', column.align === 'end' && 'flex-row-reverse')}>
                          {column.label}<Icon aria-hidden="true" strokeWidth={1.75} />
                        </button>
                      ) : column.label}
                    </th>
                  );
                })}
                {menu ? <th scope="col" className="h-10 w-16 border-b border-line bg-bg pr-5"><span className="sr-only">{t.actions}</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, rowIndex) => {
                const id = rowId(row);
                const on = selectedSet.has(id);
                const last = rowIndex === sorted.length - 1;
                const cellClass = cn('h-14 px-3 py-2 align-middle whitespace-nowrap text-ink-2', !last && 'border-b border-line');
                const marker = openId === id ? 'relative before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-ink' : '';
                return (
                  <tr key={id} data-row={id} data-selected={on || undefined} data-open={openId === id || undefined} onClick={(event) => clickRow(event, row)}
                    className={cn('cursor-pointer transition-colors duration-state hover:bg-bg-subtle data-selected:bg-bg-muted data-open:bg-bg-muted', !onOpen && 'cursor-default')}>
                    {selectable ? <td className={cn(cellClass, 'w-13 pr-0 pl-5', marker)}><Checkbox aria-label={t.selectRow(rowName(row))} checked={on} onCheckedChange={(checked) => toggle(id, Boolean(checked))} /></td> : null}
                    {columns.map((column, index) => (
                      <td key={column.key} className={cn(cellClass, column.align === 'end' && 'text-right', index === 0 && !selectable && cn('pl-5', marker), index === columns.length - 1 && !menu && 'pr-5', column.className)}>{column.cell(row)}</td>
                    ))}
                    {menu ? <td className={cn(cellClass, 'w-16 pr-5 text-right')}><RowMenu name={rowName(row)} entries={menu(row)} /></td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul role="list" aria-label={label} className="grid md:hidden">
          {sorted.map((row) => {
            const id = rowId(row);
            const on = selectedSet.has(id);
            const item = card(row);
            return (
              <li key={id} data-row-card={id} data-selected={on || undefined} onClick={(event) => clickRow(event, row)}
                className={cn('flex cursor-pointer items-start gap-3 border-b border-line py-3.5 pr-2 pl-4 last:border-b-0 data-selected:bg-bg-muted', openId === id && 'bg-bg-muted')}>
                {selectable ? <span className="mt-2.5"><Checkbox aria-label={t.selectRow(rowName(row))} checked={on} onCheckedChange={(checked) => toggle(id, Boolean(checked))} /></span> : null}
                {item.lead}
                <div className="grid min-w-0 flex-1 gap-1">
                  {onOpen ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(row); }} className="min-w-0 truncate rounded-sm text-left text-body-sm font-semibold text-ink focus-visible:focus-ring">{item.title}</button>
                    : <span className="truncate text-body-sm font-semibold text-ink">{item.title}</span>}
                  {item.meta ? <p className="truncate text-caption font-normal text-ink-3">{item.meta}</p> : null}
                  {item.tail ? <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">{item.tail}</div> : null}
                </div>
                {menu ? <RowMenu name={rowName(row)} entries={menu(row)} /> : null}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <section aria-label={label} className={cn('flex min-w-0 flex-col rounded-lg border border-line bg-bg', hasSelection && 'max-md:mb-18')}>
      {toolbar}
      {batchBar}
      {body}
      {rows.length ? (
        <div className="border-t border-line">
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={size} onPageChange={onPage} onPageSizeChange={(next) => onSize(next as PageSize)} className="px-5 max-md:px-4" />
        </div>
      ) : null}
    </section>
  );
}

/** 批量操作条里的按钮：手机只保留文字，prefix 在手机隐藏（「批量」打标、「设为」精选）。 */
export function BatchButton({ icon, prefix, children, danger, onClick, disabled }: { icon: ReactNode; prefix?: string; children: ReactNode; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant={danger ? 'danger-outline' : 'outline'} onClick={onClick} disabled={disabled}>
      {icon}<span>{prefix ? <span className="max-md:hidden">{prefix}</span> : null}{children}</span>
    </Button>
  );
}

