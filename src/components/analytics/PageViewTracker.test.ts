import { describe, expect, it } from 'vitest';
import { surfaceForPath } from './PageViewTracker';

describe('页面浏览统计的页面归类（D66 新路由）', () => {
  it('我的 / 作者主页按内容归到已有类别，不新增统计口径', () => {
    expect(surfaceForPath('/')).toBe('home');
    expect(surfaceForPath('/me')).toBe('designs');
    expect(surfaceForPath('/me/settings')).toBe('account');
    expect(surfaceForPath('/me/palettes')).toBe('palettes');
    expect(surfaceForPath('/me/public')).toBe('community');
    expect(surfaceForPath('/me/likes')).toBe('community');
    expect(surfaceForPath('/u/beadhue-official')).toBe('community');
    expect(surfaceForPath('/community/5d7a4ccc-5aa1-405c-a6c5-3471e3b4f0d6')).toBe('community');
    expect(surfaceForPath('/login')).toBe('account');
  });
});
