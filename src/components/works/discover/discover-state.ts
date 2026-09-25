/**
 * 发现页的地址状态（D66：`/?q=&cat=&sort=&size=&colors=&spec=&since=`），服务端页面与客户端组件共用。
 * 缺省值（cat=all、sort=rec）不写进地址；游标不属于状态，只在「加载更多」时临时拼上。
 */
import { LIMITS } from '@/lib/appInfo';
import type { TagIcon } from '@/lib/community/tagIcon';
import { zhCN } from '@/messages/zh-CN';

const t = zhCN.discover;

export const DISCOVER_SORTS = ['rec', 'new', 'likes', 'reuses'] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];

export const DISCOVER_FILTERS = {
  size: ['s', 'm', 'l'],
  colors: ['few', 'mid', 'many'],
  spec: ['5mm', '2.6mm'],
  since: ['7', '30'],
} as const;
export type DiscoverFilterKey = keyof typeof DISCOVER_FILTERS;
export const DISCOVER_FILTER_KEYS = Object.keys(DISCOVER_FILTERS) as DiscoverFilterKey[];

/** 筛选面板之外、但旧链接（r14 豆社）可能带来的条件：以可移除芯片列出。 */
const EXTRA_KEYS = ['author', 'palette'] as const;
type ExtraKey = (typeof EXTRA_KEYS)[number];

export type DiscoverFilters = Record<DiscoverFilterKey, string>;

export interface DiscoverState extends DiscoverFilters {
  q: string;
  /** all / featured / 标签名 */
  cat: string;
  sort: string;
  author: string;
  palette: string;
}

/** 旧豆社排序写法 → 新排序。 */
const LEGACY_SORTS: Record<string, DiscoverSort> = { latest: 'new', popular: 'likes', featured: 'rec' };

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function pick(params: RawParams, key: string): string {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** 旧豆社的制作规格（boardProfile，如 2.6mm-52）按豆径并入 spec。 */
function legacySpec(boardProfile: string): string {
  if (boardProfile.startsWith('5mm')) return '5mm';
  if (boardProfile.startsWith('2.6mm')) return '2.6mm';
  return '';
}

/** 旧豆社的起止日期：只有开到今天为止的区间能换成「一周内 / 一个月内」，更早或有截止日的区间表达不了，按不限处理。 */
function legacySince(from: string, to: string, now: number): string {
  const start = Date.parse(`${from}T00:00:00+08:00`);
  if (!from || !Number.isFinite(start)) return '';
  if (to && Date.parse(`${to}T23:59:59+08:00`) < now) return '';
  const days = (now - start) / 86_400_000;
  return days < 0 ? '' : days <= 7 ? '7' : days <= 30 ? '30' : '';
}

/**
 * 地址参数 → 状态。r14 的 `tag` 并入类目（`cat`）；旧排序值换成新值；旧的 boardProfile / from / to 尽量换成新筛选（D66）。
 * 搜索词超过接口上限时截断，而不是整页判成「筛选条件无效」。
 */
export function readDiscoverState(params: RawParams, now: number = Date.now()): DiscoverState {
  const sort = pick(params, 'sort');
  return {
    q: Array.from(pick(params, 'q')).slice(0, LIMITS.searchQueryLength).join(''),
    cat: pick(params, 'cat') || pick(params, 'tag') || 'all',
    sort: LEGACY_SORTS[sort] ?? (sort || 'rec'),
    size: pick(params, 'size'),
    colors: pick(params, 'colors'),
    spec: pick(params, 'spec') || legacySpec(pick(params, 'boardProfile')),
    since: pick(params, 'since') || legacySince(pick(params, 'from'), pick(params, 'to'), now),
    author: pick(params, 'author'),
    palette: pick(params, 'palette'),
  };
}

/** 状态 → 查询参数（只含非缺省值；顺序固定，便于缓存与比较）。 */
export function discoverSearchParams(state: DiscoverState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.cat && state.cat !== 'all') params.set('cat', state.cat);
  if (state.sort && state.sort !== 'rec') params.set('sort', state.sort);
  for (const key of [...DISCOVER_FILTER_KEYS, ...EXTRA_KEYS]) if (state[key]) params.set(key, state[key]);
  return params;
}

export function discoverHref(state: DiscoverState, patch: Partial<DiscoverState> = {}): string {
  const text = discoverSearchParams({ ...state, ...patch }).toString();
  return text ? `/?${text}` : '/';
}

export const NO_FILTERS: DiscoverFilters & Record<ExtraKey, string> = { size: '', colors: '', spec: '', since: '', author: '', palette: '' };

export function activeFilterCount(state: DiscoverFilters): number {
  return DISCOVER_FILTER_KEYS.filter((key) => state[key]).length;
}

export function sortLabel(sort: string): string {
  return (t.sorts as Record<string, string>)[sort] ?? t.sorts.rec;
}

export function filterOptionLabel(key: DiscoverFilterKey, value: string): string {
  const group = t.filters[key] as Record<string, string>;
  if (group[value]) return group[value];
  return key === 'since' ? t.sinceDays(value) : value;
}

export interface ActiveChip { key: DiscoverFilterKey | ExtraKey; label: string }

/** 网格上方的已选条件芯片（面板里的四组 + 旧链接带来的作者 / 色板）。 */
export function activeChips(state: DiscoverState): ActiveChip[] {
  const chips: ActiveChip[] = DISCOVER_FILTER_KEYS.filter((key) => state[key]).map((key) => ({ key, label: filterOptionLabel(key, state[key]) }));
  if (state.author) chips.push({ key: 'author', label: t.authorFilter(state.author) });
  if (state.palette) chips.push({ key: 'palette', label: t.paletteFilter(state.palette) });
  return chips;
}

/** 类目条上的一个类目：id 为地址里的 cat 值（all / featured / 标签名）。 */
export interface DiscoverCategory {
  id: string;
  label: string;
  /** 标签图标（服务端已解析）；null 用默认豆粒。 */
  icon: TagIcon | null;
}

export function builtinCategories(): DiscoverCategory[] {
  return [
    { id: 'all', label: t.all, icon: null },
    { id: 'featured', label: t.featured, icon: null },
  ];
}
