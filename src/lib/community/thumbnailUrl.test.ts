import { describe, expect, it } from 'vitest';
import { adminThumbnailUrl, communityThumbnailUrl, designThumbnailUrl } from './thumbnailUrl';
import { THUMBNAIL_RENDER_VERSION } from '@/lib/render/thumbnailSize';

describe('communityThumbnailUrl', () => {
  it('地址带渲染版本；默认尺寸不带 size，large 才带', () => {
    expect(THUMBNAIL_RENDER_VERSION).toBe(2);
    expect(communityThumbnailUrl('rev-1')).toBe('/api/community/revisions/rev-1/thumbnail?v=2');
    expect(communityThumbnailUrl('rev-1', 'default')).toBe('/api/community/revisions/rev-1/thumbnail?v=2');
    expect(communityThumbnailUrl('rev-1', 'large')).toBe('/api/community/revisions/rev-1/thumbnail?v=2&size=large');
  });

  it('后台与私人设计地址同样带版本，设计地址还带修订号', () => {
    expect(adminThumbnailUrl('rev-1')).toBe('/api/admin/community/revisions/rev-1/thumbnail?v=2');
    expect(designThumbnailUrl('design-1', 7)).toBe('/api/designs/design-1/thumbnail?rev=7&v=2');
  });
});
