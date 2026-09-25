/**
 * 匿名统计的事件队列：按白名单校验（zod，未声明的属性会被剔除）、批量发送、失败重试与页面隐藏时的信标。
 * 浏览器端经 client.ts 在同意统计后按需加载，不进首屏 JS。
 */
import { normalizePath, normalizeReferrerDomain } from './normalize';
import {
  analyticsClientEventSchema,
  type AnalyticsClientEvent,
  type AnalyticsEnvelope,
} from './events';

export interface ClientContext {
  path?: string;
  referrer?: string;
  utm?: AnalyticsEnvelope['utm'];
}

export interface AnalyticsClientOptions {
  isConsented: () => boolean;
  context: () => ClientContext;
  send: (events: AnalyticsEnvelope[]) => Promise<boolean>;
  beacon?: (events: AnalyticsEnvelope[]) => boolean;
  schedule: (callback: () => void, delayMs: number) => number;
  cancelSchedule: (id: number) => void;
  now: () => Date;
  randomId: () => string;
}

interface QueuedEvent {
  envelope: AnalyticsEnvelope;
  attempts: number;
}

export interface AnalyticsClient {
  track(event: AnalyticsClientEvent): void;
  flush(): Promise<void>;
  flushBeacon(): void;
  clear(): void;
}

export function createAnalyticsClient(options: AnalyticsClientOptions): AnalyticsClient {
  const queue: QueuedEvent[] = [];
  let timer: number | null = null;
  let sending: Promise<void> | null = null;
  let generation = 0;

  const cancelTimer = (): void => {
    if (timer !== null) options.cancelSchedule(timer);
    timer = null;
  };
  const scheduleFlush = (): void => {
    if (timer !== null || queue.length === 0) return;
    timer = options.schedule(() => {
      timer = null;
      void flush();
    }, 10_000);
  };
  const flush = async (): Promise<void> => {
    if (sending) return sending;
    if (!options.isConsented()) {
      queue.length = 0;
      cancelTimer();
      return;
    }
    const items = queue.splice(0, 10);
    if (items.length === 0) return;
    cancelTimer();
    const sentGeneration = generation;
    sending = (async () => {
      let accepted = false;
      try {
        accepted = await options.send(items.map((item) => item.envelope));
      } catch {
        accepted = false;
      }
      if (!accepted && sentGeneration === generation && options.isConsented()) {
        const retryable = items
          .filter((item) => item.attempts < 2)
          .map((item) => ({ ...item, attempts: item.attempts + 1 }));
        queue.unshift(...retryable);
      }
      sending = null;
      scheduleFlush();
    })();
    return sending;
  };

  return {
    track(event) {
      if (!options.isConsented()) return;
      const parsed = analyticsClientEventSchema.safeParse(event);
      if (!parsed.success) return;
      const context = options.context();
      const referrerDomain = normalizeReferrerDomain(context.referrer);
      queue.push({
        envelope: {
          ...parsed.data,
          eventId: options.randomId(),
          occurredAt: options.now().toISOString(),
          path: normalizePath(context.path),
          ...(referrerDomain ? { referrer: `https://${referrerDomain}` } : {}),
          ...(context.utm ? { utm: context.utm } : {}),
        },
        attempts: 0,
      });
      if (queue.length > 50) queue.splice(0, queue.length - 50);
      if (queue.length >= 10) void flush();
      else scheduleFlush();
    },
    flush,
    flushBeacon() {
      if (!options.isConsented() || !options.beacon) return;
      const items = queue.splice(0, 20);
      if (items.length === 0) return;
      cancelTimer();
      try {
        options.beacon(items.map((item) => item.envelope));
      } catch {
        // Analytics is best effort and never blocks navigation.
      }
    },
    clear() {
      generation++;
      queue.length = 0;
      cancelTimer();
    },
  };
}
