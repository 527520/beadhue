'use client';
import { zhCN } from '@/messages/zh-CN';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import type { CommunityListQuery } from '@/lib/community/queries';
import { BOARD_PROFILE_IDS, getBoardProfile } from '@/lib/boardProfiles';

export default function CommunityFilters({query}:{query:CommunityListQuery}){
 const [expanded,setExpanded]=useState(false);
 return <form action="/community" method="get" className="discovery-filters">
  <div className="search-row">
   <label className="search"><Icon name="search"/><input type="search" name="q" defaultValue={query.q??''} placeholder={zhCN.beadhue.searchLabel} aria-label={zhCN.beadhue.searchPattern} maxLength={80}/><button type="submit" aria-label={zhCN.beadhue.search}><Icon name="arrow" size={16}/></button></label>
   <span className="search-hint muted">{zhCN.beadhue.searchPlaceholder}</span>
   <select name="sort" className="sort" aria-label={zhCN.beadhue.sortWorks} defaultValue={query.sort} onChange={e=>e.currentTarget.form?.requestSubmit()}><option value="featured">{zhCN.beadhue.sortFeatured}</option><option value="popular">{zhCN.beadhue.sortLikes}</option><option value="latest">{zhCN.beadhue.sortNewest}</option></select>
   <button type="button" className="filter-more" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><Icon name="filter" size={15}/>{zhCN.beadhue.moreFilters}</button>
  </div>
  {query.tag&&<input type="hidden" name="tag" value={query.tag}/>}{query.palette&&<input type="hidden" name="palette" value={query.palette}/>}
  <div hidden={!expanded} className="discovery-more row wrap">
   <label>{zhCN.beadhue.author}<input name="author" defaultValue={query.author??''} maxLength={80}/></label>
   <label>{zhCN.beadhue.boardProfile}<select name="boardProfile" defaultValue={query.boardProfile??''}><option value="">{zhCN.beadhue.allProfiles}</option>{BOARD_PROFILE_IDS.map(id=><option key={id} value={id}>{getBoardProfile(id).displayName}</option>)}</select></label>
   <label>{zhCN.beadhue.dateFrom}<input type="date" name="from" defaultValue={query.from??''}/></label><label>{zhCN.beadhue.dateTo}<input type="date" name="to" defaultValue={query.to??''}/></label><button type="submit" className="button primary">{zhCN.beadhue.applyFilters}</button>
  </div>
 </form>;
}
