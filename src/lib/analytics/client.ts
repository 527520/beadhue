'use client';

import { randomId } from '@/lib/ids';
import { ANALYTICS_CONSENT_COOKIE } from './cookies';
import type { AnalyticsClient, ClientContext } from './clientQueue';
import type { AnalyticsClientEvent, AnalyticsEnvelope } from './events';

let analyticsInitialized = false;

export function setAnalyticsInitialized(value: boolean): void { analyticsInitialized = value; }

function hasBrowserConsent(): boolean {
  return typeof document !== 'undefined'
    && typeof navigator !== 'undefined' && Boolean(navigator.locks?.request) && analyticsInitialized
    && document.cookie.split(';').some((part) => part.trim() === `${ANALYTICS_CONSENT_COOKIE}=granted`);
}

function browserContext(): ClientContext {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const utm: NonNullable<AnalyticsEnvelope['utm']> = {};
  const mappings = [
    ['utm_source', 'source'],
    ['utm_medium', 'medium'],
    ['utm_campaign', 'campaign'],
    ['utm_content', 'content'],
  ] as const;
  for (const [queryName, key] of mappings) {
    const value = params.get(queryName)?.slice(0, 100);
    if (value) utm[key] = value;
  }
  return {
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer,
    ...(Object.keys(utm).length > 0 ? { utm } : {}),
  };
}

/**
 * 校验与发送队列（含 zod）在 clientQueue：同意统计后第一次记事件才加载，未同意的访客不会下载。
 * 加载完成前的事件连同当时的页面与时间先存着，加载后按原顺序补记；页面在加载前就隐藏时这些事件放弃（统计尽力而为）。
 */
interface EarlyEvent { event: AnalyticsClientEvent; context: ClientContext; at: Date }
const early: EarlyEvent[] = [];
let replaying: EarlyEvent | null = null;
let browserClient: AnalyticsClient | null = null;
let loading: Promise<void> | null = null;

async function loadBrowserClient(): Promise<void> {
  const { createAnalyticsClient } = await import('./clientQueue');
  const client = createAnalyticsClient({
    isConsented: hasBrowserConsent,
    context: () => replaying?.context ?? browserContext(),
    send: async (events) => {
      const response = await fetch('/api/analytics/events', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      });
      return response.ok;
    },
    beacon: (events) => navigator.sendBeacon(
      '/api/analytics/events',
      new Blob([JSON.stringify({ events })], { type: 'application/json' }),
    ),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelSchedule: (id) => window.clearTimeout(id),
    now: () => replaying?.at ?? new Date(),
    randomId,
  });
  browserClient = client;
  for (const item of early.splice(0)) {
    replaying = item;
    try {
      client.track(item.event);
    } finally {
      replaying = null;
    }
  }
}

export function track(event: AnalyticsClientEvent): void {
  try {
    if (browserClient) {
      browserClient.track(event);
      return;
    }
    if (!hasBrowserConsent()) return;
    early.push({ event, context: browserContext(), at: new Date() });
    if (early.length > 50) early.splice(0, early.length - 50);
    loading ??= loadBrowserClient().catch(() => {
      loading = null;
    });
  } catch {
    // Analytics failures must never affect the primary product flow.
  }
}

export function clearAnalyticsQueue(): void {
  early.length = 0;
  browserClient?.clear();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') browserClient?.flushBeacon();
  });
}
