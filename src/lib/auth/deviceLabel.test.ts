import { describe, expect, it } from 'vitest';
import { deviceLabelFromUserAgent } from './deviceLabel';

describe('deviceLabelFromUserAgent', () => {
  it('归纳常见的系统与浏览器', () => {
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe('macOS · Chrome');
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('macOS · Safari');
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0')).toBe('Windows · Edge');
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Windows · Firefox');
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')).toBe('Android · Chrome');
  });

  it('内嵌浏览器排在 Chrome / Safari 前面', () => {
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003237) NetType/WIFI Language/zh_CN')).toBe('iPhone · 微信');
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S9180) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36')).toBe('Android · 三星浏览器');
  });

  it('认不出时只留认得的部分，全都认不出为 null', () => {
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) SomeBrowser/1.0')).toBe('Linux');
    expect(deviceLabelFromUserAgent('curl/8.7.1')).toBeNull();
    expect(deviceLabelFromUserAgent('')).toBeNull();
    expect(deviceLabelFromUserAgent(null)).toBeNull();
  });
});
