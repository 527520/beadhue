/**
 * 登录设备名（账号设置「登录设备」）：只从 User-Agent 归纳「系统 · 浏览器」，如「macOS · Chrome」「iPhone · 微信」。
 * 会话表只存这个标签，不存完整 UA、网络地址或位置；两样都认不出时返回 null，界面按「这台 / 其他设备」显示。
 */
const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/u, 'iPhone'],
  [/iPad/u, 'iPad'],
  [/Android/u, 'Android'],
  [/Windows/u, 'Windows'],
  [/CrOS/u, 'ChromeOS'],
  [/Macintosh|Mac OS X/u, 'macOS'],
  [/Linux/u, 'Linux'],
];

/** 顺序要紧：微信、Edge、Opera 等都带「Chrome」或「Safari」字样，必须排在前面。 */
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/MicroMessenger/u, '微信'],
  [/QQBrowser|\bQQ\//u, 'QQ 浏览器'],
  [/UCBrowser/u, 'UC 浏览器'],
  [/SamsungBrowser/u, '三星浏览器'],
  [/Edg(?:A|iOS)?\//u, 'Edge'],
  [/OPR\/|Opera/u, 'Opera'],
  [/Firefox\/|FxiOS/u, 'Firefox'],
  [/Chrome\/|CriOS/u, 'Chrome'],
  [/Safari\//u, 'Safari'],
];

const pick = (ua: string, table: ReadonlyArray<[RegExp, string]>) => table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const parts = [pick(userAgent, SYSTEMS), pick(userAgent, BROWSERS)].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : null;
}
