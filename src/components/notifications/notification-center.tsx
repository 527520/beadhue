'use client';

import { CircleAlert, CircleCheck, EyeOff, MessageCircle, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { ShellLink } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { knownNotifications, notificationCopy, notificationHref, notificationTone, relativeTime, type NotificationItem, type NotificationPage, type NotificationTone, type NotificationType } from './notification-model';
import { decrementUnreadCount, setUnreadCount } from './use-unread-count';

const t = zhCN.notifications;
const LIST_ENDPOINT = '/api/me/notifications';
const READ_ENDPOINT = '/api/me/notifications/read';
/** 条目露出大半才算「看过」。 */
const VISIBLE_RATIO = 0.6;
/** 滚动中陆续露出的条目攒一小会儿再一起标记，少发请求。 */
const READ_BATCH_MS = 400;

const ICONS: Record<NotificationType, typeof CircleCheck> = {
  revision_approved: CircleCheck,
  revision_rejected: CircleAlert,
  work_removed: EyeOff,
  work_restored: RotateCcw,
  work_commented: MessageCircle,
};
const TONES: Record<NotificationTone, string> = {
  good: 'bg-success-soft text-success',
  attention: 'bg-danger-soft text-danger',
  neutral: 'bg-bg-muted text-ink-2',
};

async function fetchPage(cursor: string | null): Promise<NotificationPage> {
  const response = await fetch(cursor ? `${LIST_ENDPOINT}?cursor=${encodeURIComponent(cursor)}` : LIST_ENDPOINT, { cache: 'no-store' });
  const body = (await response.json().catch(() => null)) as Partial<NotificationPage> | null;
  if (!response.ok || !Array.isArray(body?.items)) throw new Error('notifications load failed');
  return { items: knownNotifications(body.items), nextCursor: body.nextCursor ?? null, unreadCount: Number(body.unreadCount) || 0 };
}

async function postRead(ids?: string[]): Promise<number | null> {
  const response = await fetch(READ_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { unreadCount?: unknown } | null;
  return typeof body?.unreadCount === 'number' ? body.unreadCount : null;
}

type Status = 'loading' | 'ready' | 'error';

/**
 * 列表状态：打开即取第一页；露出的未读条目攒批标记已读（徽标先扣减，响应回来再校正），
 * 但本次打开期间仍保留未读圆点，让人看得出哪些是新的；「全部已读」立即清掉圆点。
 */
function useNotificationList() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const queued = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const ids = [...pending.current];
    pending.current.clear();
    if (!ids.length) return;
    decrementUnreadCount(ids.length);
    void postRead(ids).then((count) => { if (count !== null) setUnreadCount(count); }).catch(() => undefined);
  }, []);

  const markSeen = useCallback((id: string, now = false) => {
    if (queued.current.has(id)) return;
    queued.current.add(id);
    pending.current.add(id);
    if (now) flush();
    else timer.current ??= setTimeout(flush, READ_BATCH_MS);
  }, [flush]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const page = await fetchPage(null);
      setItems(page.items);
      setCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    // 挂载即加载（弹层每次打开都重新挂载）；setState 都在 await 之后。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return flush;
  }, [load, flush]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      toast(t.loadMoreFailed);
    } finally {
      setLoadingMore(false);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const count = await postRead();
      if (count === null) throw new Error('mark all failed');
      setUnreadCount(count);
      setItems((previous) => previous.map((item) => (item.read ? item : { ...item, read: true })));
    } catch {
      toast(t.markAllFailed);
    } finally {
      setMarkingAll(false);
    }
  };

  return { status, items, cursor, loadingMore, markingAll, load, loadMore, markAll, markSeen };
}

/** 未读条目露出时通知 onSeen；没有 IntersectionObserver 的环境按「渲染即露出」处理。 */
function useSeenObserver(onSeen: (id: string) => void) {
  const observer = useRef<IntersectionObserver | null>(null);
  const nodes = useRef(new Set<HTMLElement>());
  const callback = useRef(onSeen);
  useEffect(() => { callback.current = onSeen; }, [onSeen]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const instance = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        instance.unobserve(node);
        nodes.current.delete(node);
        if (node.dataset.id) callback.current(node.dataset.id);
      }
    }, { threshold: VISIBLE_RATIO });
    observer.current = instance;
    for (const node of nodes.current) instance.observe(node);
    return () => {
      instance.disconnect();
      observer.current = null;
    };
  }, []);
  return useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      if (node.dataset.id) callback.current(node.dataset.id);
      return;
    }
    nodes.current.add(node);
    observer.current?.observe(node);
    return () => {
      nodes.current.delete(node);
      observer.current?.unobserve(node);
    };
  }, []);
}

function NotificationRow({ item, now, observe, onOpen }: { item: NotificationItem; now: number; observe?: (node: HTMLElement | null) => void; onOpen: () => void }) {
  const Icon = ICONS[item.type];
  const { text, detail } = notificationCopy(item);
  return (
    <li ref={item.read ? undefined : observe} data-id={item.id}>
      <ShellLink
        href={notificationHref(item)}
        onClick={onOpen}
        data-unread={item.read ? undefined : ''}
        className="flex gap-3 rounded-menu-item px-2.5 py-2.5 text-left outline-none hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:focus-ring"
      >
        <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-full [&>svg]:size-4.5', TONES[notificationTone(item.type)])}>
          <Icon strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          {item.read ? null : <span className="sr-only">{`${t.unreadMark}，`}</span>}
          <span className={cn('line-clamp-2 block text-body-sm text-ink', !item.read && 'font-medium')}>{text}</span>
          {detail ? <span className="mt-0.5 line-clamp-2 block text-caption font-normal text-ink-3">{detail}</span> : null}
          <time dateTime={item.createdAt} className="mt-0.5 block text-caption font-normal text-ink-3 tabular-nums">{relativeTime(item.createdAt, now)}</time>
        </span>
        {item.read ? null : <span aria-hidden="true" data-slot="unread-dot" className="mt-2 size-2 shrink-0 rounded-full bg-ink" />}
      </ShellLink>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-1 px-2.5 py-1">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex gap-3 py-2.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-1.5 pt-0.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 通知中心的内容：桌面放进弹出层（自带标题行），手机放进底部面板（标题行即面板标题，「全部已读」挨着关闭按钮）。
 * 由铃铛在打开时挂载、关闭时卸载。
 */
export function NotificationCenter({ sheet = false, unreadCount, onClose }: { sheet?: boolean; unreadCount: number; onClose: () => void }) {
  const list = useNotificationList();
  const observe = useSeenObserver(list.markSeen);
  const [now] = useState(() => Date.now());
  const hasUnread = unreadCount > 0 || list.items.some((item) => !item.read);
  const markAll = list.status === 'ready' && hasUnread ? (
    <Button variant="ghost" size="sm" loading={list.markingAll} onClick={() => void list.markAll()}>{t.markAll}</Button>
  ) : null;

  let body: ReactNode;
  if (list.status === 'loading' && !list.items.length) body = <ListSkeleton />;
  else if (list.status === 'error') {
    body = (
      <div className="grid justify-items-center gap-3 px-4 py-8 text-center">
        <p role="alert" className="text-body-sm text-ink-3">{t.loadFailed}</p>
        <Button size="sm" onClick={() => void list.load()}>{t.retry}</Button>
      </div>
    );
  } else if (!list.items.length) body = <EmptyState compact kind="notifications" title={t.emptyTitle} description={t.emptyText} />;
  else {
    body = (
      <>
        <ul role="list" aria-label={t.title} className="grid">
          {list.items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              now={now}
              observe={observe}
              onOpen={() => {
                if (!item.read) list.markSeen(item.id, true);
                onClose();
              }}
            />
          ))}
        </ul>
        {list.cursor ? (
          <div className="flex justify-center pt-1 pb-1.5">
            <Button variant="ghost" size="sm" loading={list.loadingMore} onClick={() => void list.loadMore()}>{t.loadMore}</Button>
          </div>
        ) : null}
      </>
    );
  }

  if (sheet) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          {markAll}
        </DialogHeader>
        <DialogBody className="px-2.5">{body}</DialogBody>
      </>
    );
  }
  return (
    <>
      <header className="flex min-h-10 items-center gap-2 pr-1 pl-2.5">
        <h2 className="min-w-0 flex-1 text-title-3 text-ink">{t.title}</h2>
        {markAll}
      </header>
      <div className="max-h-popover-list overflow-y-auto overscroll-contain">{body}</div>
    </>
  );
}
