import { zhCN } from '@/messages/zh-CN';

const c = zhCN.adminUi.common;
const ZONE = 'Asia/Shanghai';

function parts(date: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return values as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

/** 「09-23 14:32」（上海时间）。 */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return c.none;
  const p = parts(new Date(value));
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** 「2026-09-23」（上海时间）。 */
export function fmtDay(value: string | Date | null | undefined): string {
  if (!value) return c.none;
  const p = parts(new Date(value));
  return `${p.year}-${p.month}-${p.day}`;
}

/** 刚刚 / N 分钟前 / N 小时前 / 昨天 HH:mm / MM-DD HH:mm。 */
export function fmtAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return c.none;
  const date = new Date(value);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return c.justNow;
  if (minutes < 60) return c.minutesAgo(minutes);
  if (minutes < 24 * 60) return c.hoursAgo(Math.floor(minutes / 60));
  const yesterday = parts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const p = parts(date);
  if (minutes < 48 * 60 && p.day === yesterday.day) return c.yesterday(`${p.hour}:${p.minute}`);
  return fmtDate(date);
}

export const fmtNum = (value: number) => value.toLocaleString('en-US');
