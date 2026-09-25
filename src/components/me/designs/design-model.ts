/**
 * 「我的 · 设计」的纯数据规则：
 * 地址参数、状态归类、实时搜索、排序与计数。无 DOM 依赖，服务端页面也读地址参数。
 */
import { beadHex } from '@/lib/render/beads';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';

export const DESIGN_STATUSES = ['all', 'draft', 'stitching', 'published'] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];
export const DESIGN_SORTS = ['recent', 'name', 'size'] as const;
export type DesignSort = (typeof DESIGN_SORTS)[number];
export type DesignView = 'grid' | 'list';

export interface DesignsQuery {
  q: string;
  status: DesignStatus;
  sort: DesignSort;
  view: DesignView;
}

export const DEFAULT_DESIGNS_QUERY: DesignsQuery = { q: '', status: 'all', sort: 'recent', view: 'grid' };

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function param(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(value: string | undefined, list: readonly T[], fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

export function readDesignsQuery(source: ParamSource): DesignsQuery {
  return {
    q: (param(source, 'q') ?? '').slice(0, 100),
    status: pick(param(source, 'status'), DESIGN_STATUSES, 'all'),
    sort: pick(param(source, 'sort'), DESIGN_SORTS, 'recent'),
    view: param(source, 'view') === 'list' ? 'list' : 'grid',
  };
}

/** 只写非默认值；全部默认时为空串。 */
export function designsQueryString(query: DesignsQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status !== 'all') params.set('status', query.status);
  if (query.sort !== 'recent') params.set('sort', query.sort);
  if (query.view !== 'grid') params.set('view', query.view);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export type SyncStatus = 'synced' | 'unsynced' | 'localOnly' | 'conflict';

/** 设计列表的一项：本机与云端合并后的结果。 */
export interface LibraryDesign {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: string;
  revision: number;
  localPresent: boolean;
  cloudPresent: boolean;
  status: SyncStatus;
  /** 本机图纸：未同步的设计用它在浏览器里渲染预览，也用来数颜色。 */
  pattern: Pattern | null;
  colorCount: number | null;
  /** 跟拼进度百分比；没有进度为 null（进度只存在这台设备上）。 */
  progress: number | null;
  /** 当前以这张设计为来源的豆社作品正在公开。 */
  published: boolean;
}

export const isStitching = (design: Pick<LibraryDesign, 'progress'>): boolean => design.progress !== null;

export function matchesStatus(design: Pick<LibraryDesign, 'progress' | 'published'>, status: DesignStatus): boolean {
  if (status === 'all') return true;
  if (status === 'stitching') return isStitching(design);
  if (status === 'published') return design.published;
  return !isStitching(design) && !design.published;
}

const byRecent = (a: LibraryDesign, b: LibraryDesign) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.id.localeCompare(b.id);
const ORDER: Record<DesignSort, (a: LibraryDesign, b: LibraryDesign) => number> = {
  recent: byRecent,
  name: (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN') || byRecent(a, b),
  size: (a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height) || a.width * a.height - b.width * b.height || byRecent(a, b),
};

/** matched：只按名称搜索（状态芯片的计数基于它）；shown：再按状态筛选并排序。 */
export function filterDesigns(list: readonly LibraryDesign[], query: Pick<DesignsQuery, 'q' | 'status' | 'sort'>): { matched: LibraryDesign[]; shown: LibraryDesign[] } {
  const needle = query.q.trim().toLocaleLowerCase('zh-CN');
  const matched = needle ? list.filter((design) => design.name.toLocaleLowerCase('zh-CN').includes(needle)) : [...list];
  const shown = matched.filter((design) => matchesStatus(design, query.status)).sort(ORDER[query.sort]);
  return { matched, shown };
}

export function statusCounts(matched: readonly LibraryDesign[]): Record<DesignStatus, number> {
  return {
    all: matched.length,
    draft: matched.filter((design) => matchesStatus(design, 'draft')).length,
    stitching: matched.filter(isStitching).length,
    published: matched.filter((design) => design.published).length,
  };
}

/** 图纸用到的颜色数（透明与背景外部格不算）。 */
export function countColors(pattern: Pattern): number {
  const seen = new Set<string>();
  for (const cell of pattern.cells) {
    const hex = beadHex(cell);
    if (hex) seen.add(hex.toUpperCase());
  }
  return seen.size;
}

/** 整卡链接的状态说明（读屏）：「跟拼中，已完成 32%，仅本机」。cloud 为 false（游客）时不提本机 / 云端。 */
export function designStateText(design: LibraryDesign, cloud: boolean): string {
  const s = zhCN.me.designs.states;
  const parts: string[] = [];
  if (isStitching(design)) parts.push(s.stitching(design.progress ?? 0));
  else if (!design.published) parts.push(s.draft);
  if (design.published) parts.push(s.published);
  if (cloud) {
    if (design.status === 'conflict') parts.push(s.conflict);
    else if (design.status === 'unsynced') parts.push(design.cloudPresent ? s.unsynced : s.localOnly);
  }
  return parts.join('，');
}

/** 删除确认里那句补充说明。 */
export function deleteNote(design: LibraryDesign): string {
  const t = zhCN.me.designs;
  if (design.published) return t.deleteNotePublished;
  return design.cloudPresent ? t.deleteNoteCloud : t.deleteNoteLocal;
}
