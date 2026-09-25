/** 全站共用的数字与时间格式（纯函数，服务端与客户端都可调用）。 */
import { zhCN } from '@/messages/zh-CN';

const t = zhCN.time;

/** 计数缩写：满 1 万写「1.2万」，满 1000 写「5.2k」，整数不带「.0」。 */
export function formatCount(value: number): string {
  const short = (n: number) => n.toFixed(1).replace(/\.0$/u, '');
  if (value >= 10_000) return t.tenThousand(short(value / 10_000));
  if (value >= 1_000) return t.thousand(short(value / 1_000));
  return String(value);
}

/** 上海时间的长日期：「2026年9月23日」。 */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeZone: 'Asia/Shanghai' }).format(new Date(iso));
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前（≤30 天），更早写长日期。 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return t.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days <= 30) return t.daysAgo(days);
  return longDate(iso);
}
