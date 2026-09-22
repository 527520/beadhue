'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import ResponsiveSelect from '@/components/ui/ResponsiveSelect';
import DatePicker from '@/components/ui/DatePicker';
import { zhCN } from '@/messages/zh-CN';
import type { CommunityListQuery } from '@/lib/community/queries';
import { BOARD_PROFILE_IDS, getBoardProfile } from '@/lib/boardProfiles';

export default function CommunityFilters({ query }: { query: CommunityListQuery }) {
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const t = zhCN.beadhue;
  const changeSort = (sort: string) => {
    if (!formRef.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(formRef.current)) {
      if (typeof value === 'string' && value) params.set(key, value);
    }
    params.set('sort', sort);
    router.push(`/community?${params}`);
  };
  return <form ref={formRef} action="/community" method="get" className="discovery-filters">
    <div className="search-row">
      <label className="search">
        <Icon name="search" />
        <input type="search" name="q" defaultValue={query.q ?? ''} placeholder={t.searchLabel} aria-label={t.searchPattern} maxLength={80} />
        <button type="submit" aria-label={t.search}><Icon name="arrow" size={16} /></button>
      </label>
      <span className="search-hint muted">{t.searchPlaceholder}</span>
      <div className="discovery-filter-actions">
        <ResponsiveSelect label={t.sortWorks} hideLabel name="sort" value={query.sort} onValueChange={changeSort} className="discovery-sort" options={[
          { value: 'featured', label: t.sortFeatured },
          { value: 'popular', label: t.sortLikes },
          { value: 'latest', label: t.sortNewest },
        ]} />
        <button type="button" className="filter-more" aria-expanded={expanded} aria-controls="discovery-filter-details" onClick={() => setExpanded(v => !v)}>
          <Icon name="filter" size={15} />{t.moreFilters}
        </button>
      </div>
    </div>
    {query.tag && <input type="hidden" name="tag" value={query.tag} />}
    {query.palette && <input type="hidden" name="palette" value={query.palette} />}
    <div id="discovery-filter-details" hidden={!expanded} className="discovery-filter-grid">
      <label className="discovery-author"><span>{t.author}</span><input className="input-field" name="author" defaultValue={query.author ?? ''} maxLength={80} /></label>
      <ResponsiveSelect label={t.boardProfile} name="boardProfile" defaultValue={query.boardProfile ?? ''} options={[
        { value: '', label: t.allProfiles },
        ...BOARD_PROFILE_IDS.map(id => ({ value: id, label: getBoardProfile(id).displayName })),
      ]} />
      <DatePicker label={t.dateFrom} name="from" defaultValue={query.from ?? ''} />
      <DatePicker label={t.dateTo} name="to" defaultValue={query.to ?? ''} />
      <button type="submit" className="button primary discovery-apply">{t.applyFilters}</button>
    </div>
  </form>;
}
