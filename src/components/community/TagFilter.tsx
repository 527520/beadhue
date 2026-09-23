'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zhCN } from '@/messages/zh-CN';
import type { CommunityListQuery } from '@/lib/community/queries';

export interface TagFilterOption { id: string; name: string; slug: string; count: number }

interface Props {
  /** 服务端一次聚合查询取回的公开标签（含各自的作品数）。 */
  tags: TagFilterOption[];
  /** 当前筛选参数：切换标签时保留除 tag / cursor 之外的项。 */
  query: CommunityListQuery;
  /** 当前生效的标签名（服务端已沿合并链解析）；未筛选时为 null。 */
  activeTag: string | null;
}

/** 与 TagInput 同一套规整：全角转半角、折叠空白；中文没有大小写，仍统一按 zh-CN 小写比较。 */
const normalize = (raw: string) => raw.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('zh-CN');

/**
 * 豆社标签单选控件（admin-round-3 09）：本地过滤 + ↑↓ 移动 + 回车确认 + Esc 收起，
 * 沿用 TagInput 的 combobox / listbox 标记但不引依赖。候选列表只在聚焦时出现，
 * 所以供爬虫抓取的服务端 `?tag=` 链接仍由热门标签芯片承担；当前标签在这里可一键清除。
 */
export default function TagFilter({ tags, query, activeTag }: Props) {
  const t = zhCN.communityAdmin.community;
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputId = `${listId}-input`;
  const inputRef = useRef<HTMLInputElement>(null);
  // 除标签与游标外的筛选参数原样保留：切换标签不会丢掉搜索、排序或作者。
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === 'string' && value && key !== 'tag' && key !== 'cursor') params.set(key, value);
  const hrefFor = (name: string | null) => {
    const next = new URLSearchParams(params);
    if (name) next.set('tag', name);
    const search = next.toString();
    return search ? `/?${search}` : '/';
  };

  if (tags.length === 0) return null;

  const keyword = normalize(draft);
  const matches = tags.filter((tag) => normalize(tag.name).includes(keyword));
  const listOpen = open && matches.length > 0;
  const validActive = active >= 0 && active < matches.length;
  const pick = (name: string) => { setOpen(false); setActive(-1); setDraft(''); router.push(hrefFor(name)); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length > 0) { event.preventDefault(); setOpen(true); setActive((index) => (index + 1) % matches.length); }
    else if (event.key === 'ArrowUp' && matches.length > 0) { event.preventDefault(); setOpen(true); setActive((index) => (index <= 0 ? matches.length - 1 : index - 1)); }
    else if (event.key === 'Enter' && matches.length > 0) { event.preventDefault(); pick(matches[validActive ? active : 0].name); }
    else if (event.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  return (
    <div className="tag-filter">
      <label className="tag-filter-label" htmlFor={inputId}>{t.tagFilterLabel}</label>
      <div className="tag-filter-combo">
        <div className="tag-filter-field" onClick={() => inputRef.current?.focus()}>
          {activeTag && <Link href={hrefFor(null)} className="tag-filter-chip" aria-label={t.clearTag(activeTag)}>{t.activeTag(activeTag)} ×</Link>}
          <input ref={inputRef} id={inputId} className="tag-filter-text" type="text" role="combobox" autoComplete="off"
            value={draft} placeholder={t.tagFilterPlaceholder}
            aria-expanded={listOpen} aria-controls={listOpen ? `${listId}-list` : undefined}
            aria-activedescendant={listOpen && validActive ? `${listId}-option-${active}` : undefined}
            aria-autocomplete="list"
            onFocus={() => setOpen(true)}
            onBlur={() => { window.setTimeout(() => { setOpen(false); setActive(-1); }, 120); }}
            onChange={(event) => { setDraft(event.target.value); setActive(-1); setOpen(true); }}
            onKeyDown={onKeyDown}
          />
        </div>
        {listOpen && <ul className="tag-filter-suggestions" id={`${listId}-list`} role="listbox" aria-label={t.tagFilterLabel}>
          {matches.map((tag, index) => <li key={tag.id} id={`${listId}-option-${index}`} role="option" aria-selected={index === active} className="tag-filter-option"
            onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(tag.name)}>
            {tag.name}<small>{t.tagFilterCount(tag.count)}</small>
          </li>)}
        </ul>}
        {open && matches.length === 0 && <p className="tag-filter-empty">{t.tagFilterEmpty}</p>}
      </div>
      <p className="tag-filter-help">{t.tagFilterHint}</p>
    </div>
  );
}
