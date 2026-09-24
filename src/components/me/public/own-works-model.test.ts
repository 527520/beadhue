import { describe, expect, it } from 'vitest';
import { ownSummary, toOwnItems, type OwnWork } from './own-works-model';

const now = Date.parse('2026-09-24T12:00:00Z');
const preview = { version: 1, width: 10, height: 10, originalWidth: 10, originalHeight: 10, cells: [], colorBand: [] } as unknown as OwnWork['revisions'][number]['preview'];
function revision(id: string, status: string, patch: Partial<OwnWork['revisions'][number]> = {}): OwnWork['revisions'][number] {
  return { id, workId: 'w', revisionNumber: 1, title: `标题${id}`, sourceDesignId: 'd1', frozenDisplayName: '作者', status, version: 1, preview, suggestedTags: [], submittedAt: '2026-09-24T10:00:00Z', reviewedAt: null, reviewReason: null, createdAt: '2026-09-24T09:00:00Z', ...patch } as OwnWork['revisions'][number];
}
function work(id: string, patch: Partial<OwnWork>, revisions: OwnWork['revisions']): OwnWork {
  return { id, lifecycleStatus: 'active', version: 2, currentPublishedRevisionId: null, likeCount: 12, commentCount: 3, reuseCount: 2, createdAt: '', updatedAt: '', revisions, ...patch } as OwnWork;
}

describe('公开作品归类', () => {
  it('审核中 / 未通过附原因 / 已公开 / 已下架；整件撤回的不显示', () => {
    const items = toOwnItems([
      work('review', {}, [revision('r1', 'pending_review')]),
      work('rejected', {}, [revision('r2', 'rejected', { reviewReason: '与社区作品几乎相同', reviewedAt: '2026-09-23T12:00:00Z' })]),
      work('live', { currentPublishedRevisionId: 'r3' }, [revision('r3', 'published')]),
      work('removed', { lifecycleStatus: 'removed', currentPublishedRevisionId: 'r4' }, [revision('r4', 'published')]),
      work('gone', { lifecycleStatus: 'withdrawn' }, [revision('r5', 'withdrawn')]),
    ], now);
    expect(items.map((item) => [item.workId, item.kind])).toEqual([['review', 'review'], ['rejected', 'rejected'], ['live', 'published'], ['removed', 'removed']]);
    expect(items[0].note).toBe('2 小时前提交 · 通常 1 天内审完');
    expect(items[1]).toMatchObject({ reason: '与社区作品几乎相同', note: '1 天前审核', publicHref: null, editHref: '/community/submit?workId=rejected&designId=d1' });
    expect(items[2]).toMatchObject({ note: null, publicHref: '/community/live', likes: 12, thumbnailUrl: '/api/community/revisions/r3/thumbnail?v=2' });
    expect(ownSummary(items)).toEqual([[1, '件已公开'], [1, '件审核中'], [1, '件未通过'], [1, '件已下架']]);
  });

  it('已公开作品的新版本在审：仍给公开页，说明原版本仍在展示；撤回的新版本回到已公开', () => {
    const [inReview, withdrawn] = toOwnItems([
      work('a', { currentPublishedRevisionId: 'old' }, [revision('new', 'pending_review'), revision('old', 'published')]),
      work('b', { currentPublishedRevisionId: 'old2' }, [revision('new2', 'withdrawn'), revision('old2', 'published')]),
    ], now);
    expect(inReview).toMatchObject({ kind: 'review', publicHref: '/community/a', note: '新版本审核中，原版本仍在公开展示', latest: { id: 'new' } });
    expect(withdrawn).toMatchObject({ kind: 'published', title: '标题old2' });
  });
});
