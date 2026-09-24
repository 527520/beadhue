'use client';

import { Ellipsis, Flag, Lock, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { track } from '@/lib/analytics/client';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { avatarIdOf, displayNameOf } from '@/components/shell/account-menu';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { fieldControlClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from './action-menu';
import { relativeTime } from './detail-format';

const t = zhCN.detail;
const BODY_MAX = 500;
const COUNTER_FROM = 400;
const iconProps = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

export interface CommentItem {
  id: string;
  author: { publicAuthorId: string; displayName: string; avatarColor?: string | null };
  body: string;
  version: number;
  createdAt: string;
  deletable: boolean;
  status: 'published' | 'pending_review' | 'hidden';
}

async function readError(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  return { message: body?.error?.message ?? fallback, code: body?.error?.code };
}

export interface DiscussionProps {
  workId: string;
  loggedIn: boolean;
  commentsLocked: boolean;
  initialCount: number;
  onLogin: () => void;
  onReport: (commentId: string) => void;
}

/**
 * 讨论（原型 talk）：输入框在上，评论最新在前、游标分页；自己的评论可删除（二次确认），他人评论可举报；
 * 自己待审核 / 已隐藏的评论带状态徽标；没有评论时只一句邀请。
 */
export function Discussion({ workId, loggedIn, commentsLocked, initialCount, onLogin, onReport }: DiscussionProps) {
  const toast = useToast();
  const auth = useAuthStatus();
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [items, setItems] = useState<CommentItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'more'>('loading');
  const [count, setCount] = useState(initialCount);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(commentsLocked);
  const [deleting, setDeleting] = useState<CommentItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async (from: string | null = null) => {
    const id = ++request.current;
    setState(from ? 'more' : 'loading');
    try {
      const params = new URLSearchParams({ order: 'desc' });
      if (from) params.set('cursor', from);
      const response = await fetch(`/api/community/works/${workId}/comments?${params}`, { cache: 'no-store' });
      const result = (await response.json().catch(() => null)) as { items?: CommentItem[]; nextCursor?: string | null } | null;
      if (!response.ok || !Array.isArray(result?.items)) throw new Error('comments failed');
      if (id !== request.current) return;
      const page = result.items;
      setItems((current) => (from ? [...current, ...page.filter((item) => !current.some((known) => known.id === item.id))] : page));
      setCursor(result.nextCursor ?? null);
      setState('ready');
    } catch {
      if (id === request.current) setState(from ? 'ready' : 'error');
      if (from) toast(t.commentsFailed);
    }
  }, [toast, workId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只发起读取，状态在响应返回后更新。
    void load();
  }, [load]);

  const resize = (node: HTMLTextAreaElement) => {
    node.style.height = 'auto';
    const next = node.scrollHeight + 2;
    node.style.height = `${Math.min(next, 240)}px`;
    node.style.overflowY = next > 240 ? 'auto' : 'hidden';
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/works/${workId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: text }) });
      if (!response.ok) {
        const failure = await readError(response, t.postFailed);
        if (failure.code === 'COMMENTS_LOCKED') setLocked(true);
        throw new Error(failure.message);
      }
      const result = (await response.json()) as { status?: string };
      const pending = result.status === 'pending_review';
      track({ name: 'community_comment_created', properties: { moderationState: pending ? 'pending_review' : 'published' } });
      setBody('');
      if (inputRef.current) { inputRef.current.value = ''; resize(inputRef.current); }
      if (!pending) setCount((value) => value + 1);
      toast(pending ? t.pendingPosted : t.posted);
      await load();
    } catch (reason) {
      setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : t.postFailed);
    } finally {
      setPosting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/community/comments/${deleting.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: deleting.version }) });
      if (!response.ok) throw new Error((await readError(response, t.deleteFailed)).message);
      const removed = deleting;
      setItems((current) => current.filter((item) => item.id !== removed.id));
      if (removed.status === 'published') setCount((value) => Math.max(0, value - 1));
      setDeleting(null);
      toast(t.deleted);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (reason) {
      setDeleteError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : t.deleteFailed);
    } finally {
      setDeletePending(false);
    }
  };

  const me = auth.kind === 'user' ? auth : null;
  let composer;
  if (!loggedIn) {
    composer = (
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-bg-subtle py-2 pr-2 pl-3">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-bg-emphasis text-ink-3"><User {...iconProps} className="size-4.5" /></span>
        <p className="text-body-sm text-ink-2">{t.loginToTalk}</p>
        <Button size="sm" variant="outline" onClick={onLogin}>{t.login}</Button>
      </div>
    );
  } else if (locked) {
    composer = (
      <p className="flex items-start gap-2 rounded-lg bg-bg-subtle px-3 py-3 text-body-sm text-ink-2">
        <Lock {...iconProps} className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <span>{t.talkLocked}</span>
      </p>
    );
  } else {
    composer = (
      <form onSubmit={(event) => void submit(event)} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <Avatar id={me ? avatarIdOf(me) : 'me'} name={me ? displayNameOf(me) : ''} color={me?.avatarColor ?? undefined} className="mt-2" />
        <div className="min-w-0">
          <label htmlFor={inputId} className="sr-only">{t.commentLabel}</label>
          <textarea
            ref={inputRef}
            id={inputId}
            rows={1}
            maxLength={BODY_MAX}
            value={body}
            placeholder={t.commentPlaceholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(event) => { setBody(event.target.value); resize(event.target); if (error) setError(null); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }}
            className={cn(fieldControlClass, 'block max-h-60 min-h-control-lg resize-none overflow-y-hidden py-3 leading-normal')}
          />
          {error ? <FormAlert className="mt-2"><span id={`${inputId}-error`}>{error}</span></FormAlert> : null}
          <div className="mt-2 flex items-center justify-end gap-3">
            {body.length >= COUNTER_FROM ? <span className="text-caption text-ink-3 tabular-nums">{body.length}/{BODY_MAX}</span> : null}
            <Button type="submit" size="sm" variant="outline" disabled={!body.trim()} loading={posting}>{t.post}</Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <section aria-labelledby="detail-talk-title" className="grid min-w-0 content-start gap-5 max-md:mt-8 max-md:border-t max-md:border-line max-md:pt-6 lg:pt-4">
      <h2 id="detail-talk-title" className="text-title-2 text-ink">
        {t.talk}
        {count > 0 ? <span className="font-normal text-ink-3 tabular-nums"> · {count}</span> : null}
      </h2>
      {composer}
      {state === 'loading' ? (
        <div aria-hidden="true" className="grid gap-4">
          {[0, 1].map((key) => (
            <div key={key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-line pt-4">
              <Skeleton className="size-8 rounded-full" />
              <div className="grid gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3.5 w-4/5" /></div>
            </div>
          ))}
        </div>
      ) : state === 'error' ? (
        <p role="status" className="flex items-center gap-2 text-body-sm text-ink-3">
          {t.commentsFailed}
          <Button size="sm" variant="ghost" onClick={() => void load()}>{t.retry}</Button>
        </p>
      ) : items.length === 0 ? (
        <p className="text-body-sm text-ink-3">{t.talkEmpty}</p>
      ) : (
        <ol aria-label={t.commentList} className="grid">
          {items.map((item) => (
            <li key={item.id} id={`comment-${item.id}`} data-status={item.status} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-t border-line py-4 last:pb-0">
              <Link href={`/u/${encodeURIComponent(item.author.publicAuthorId)}`} tabIndex={-1} aria-hidden="true" className="self-start rounded-full">
                <Avatar id={item.author.publicAuthorId} name={item.author.displayName} color={item.author.avatarColor ?? undefined} />
              </Link>
              <div className="min-w-0">
                <p className="flex min-w-0 items-baseline gap-2 text-caption font-normal whitespace-nowrap text-ink-3">
                  <Link href={`/u/${encodeURIComponent(item.author.publicAuthorId)}`} className="truncate text-body-sm font-semibold text-ink hover:underline hover:underline-offset-3">{item.author.displayName}</Link>
                  <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
                  {item.status !== 'published' ? <Badge tone="warning" className="self-center">{t.commentStates[item.status]}</Badge> : null}
                </p>
                <p className="mt-1 text-body text-ink-2 [overflow-wrap:anywhere]">{item.body}</p>
                {item.status === 'pending_review' ? <p className="mt-1 text-caption font-normal text-ink-3">{t.pendingHint}</p> : null}
              </div>
              <ActionMenu
                title={t.commentMenu}
                trigger={<IconButton size="sm" label={t.commentMore(item.author.displayName)} tooltip={t.moreTip} className="-mt-1 -mr-2 text-ink-3"><Ellipsis {...iconProps} /></IconButton>}
                items={item.deletable
                  ? [{ id: 'delete', label: t.deleteComment, icon: <Trash2 {...iconProps} />, danger: true, onSelect: () => { setDeleteError(null); setDeleting(item); } }]
                  : [{ id: 'report', label: t.report, icon: <Flag {...iconProps} />, onSelect: () => onReport(item.id) }]}
              />
            </li>
          ))}
        </ol>
      )}
      {cursor && state !== 'loading' && state !== 'error' ? (
        <div className="flex justify-center">
          <Button size="sm" variant="secondary" loading={state === 'more'} onClick={() => void load(cursor)}>{t.moreComments}</Button>
        </div>
      ) : null}
      <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open && !deletePending) setDeleting(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t.deleteTitle}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-3">
            <p className="text-body text-ink-2">{t.deleteBody}</p>
            <FormAlert>{deleteError}</FormAlert>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>{t.cancel}</DialogClose>
            <Button variant="danger" loading={deletePending} onClick={() => void confirmDelete()}>{t.delete}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
