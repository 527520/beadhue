/** 详情页与作者主页的纯格式化函数（服务端与客户端共用，不带 'use client'）。 */
import { zhCN } from '@/messages/zh-CN';

const t = zhCN.detail;

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前（≤30 天），更早写「2026年9月23日」。 */
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

export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeZone: 'Asia/Shanghai' }).format(new Date(iso));
}

/** 统计数字：≥1 万写「1.2万」，≥1000 写「2.8k」。 */
export function formatCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
