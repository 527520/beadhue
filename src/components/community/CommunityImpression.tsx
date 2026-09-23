'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics/client';
import type { CommunitySort } from '@/lib/community/queries';

export function CommunityListImpression({ sort }: { sort: CommunitySort }) {
  useEffect(() => { track({ name: 'community_list_viewed', properties: { sort } }); }, [sort]);
  return null;
}

export function CommunityDetailImpression() {
  useEffect(() => { track({ name: 'community_detail_viewed', properties: {} }); }, []);
  return null;
}
