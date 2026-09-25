'use client';

/**
 * 「公开到豆社」弹窗（D72）：标题、建议标签（D68，≤5 个、每个 ≤8 字）、
 * 原图同意与发布权两个勾选框、提交审核。投稿三步沿用豆社接口：创建草稿（带建议标签）→ 上传作品原图 → 提交审核。
 * 带 workId 时是已有作品的「修改后重投」：草稿建在该作品下；本次会话没有原图就沿用上一版原图。
 */
import { Image as ImageIcon, Lock, Plus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { BeadImage } from '@/components/ui/bead-image';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip, RemovableChip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { isDefiniteCommunityRejection, postCommunityCommand } from '@/components/community/communityCommand';
import { track } from '@/lib/analytics/client';
import { COMMUNITY_LICENSE_VERSION } from '@/lib/community/snapshot';
import { OriginalUploadError, uploadRevisionOriginal } from '@/lib/community/originalsClient';
import { convertHeicWithWasm } from '@/lib/image/decode';
import type { ImageType } from '@/lib/image/sniff';
import { randomId } from '@/lib/ids';
import { discardPendingOriginal } from '@/lib/storage/pendingOriginals';
import { createBeadhueApi } from '@/lib/sync/api';
import { ApiError } from '@/lib/sync/clientAdapter';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { Note } from './editor-parts';

const TITLE_MAX = 30;
const TAG_LIMIT = 5;
const TAG_MAX = 8;

/** 与服务端建议标签规范化一致：全角转半角、折叠空白、1–8 个字、大小写不敏感去重。 */
export function normalizeTag(raw: string): string | null {
  const name = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!name || Array.from(name).length > TAG_MAX || /[\u0000-\u001f\u007f<>]/u.test(name)) return null;
  return name;
}

export interface PublishOriginal {
  bytes: Uint8Array;
  type: ImageType;
  name: string;
}

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designId: string;
  /** 已有作品：为它提交新修订。 */
  workId?: string;
  designName: string;
  pattern: Pattern;
  /** 当前会话里的完整原图；没有时要求先选择原图。 */
  getOriginal: () => PublishOriginal | null;
  hasOriginal: boolean;
  /** 保存并同步到云端；false 表示失败。 */
  prepare: () => Promise<boolean>;
  onChooseSource: () => void;
  onSubmitted: () => void;
}

export function PublishDialog({ open, onOpenChange, ...rest }: PublishDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      {open ? <PublishBody {...rest} busy={busy} setBusy={setBusy} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function useSuggestions(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/community/tags')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: Array<{ name: string; featured?: boolean }> } | null) => {
        if (cancelled || !body?.items) return;
        const sorted = [...body.items].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
        setNames(sorted.map((item) => item.name).filter((name) => normalizeTag(name) !== null).slice(0, 6));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return names;
}

function PublishBody({ designId, workId, designName, pattern, getOriginal, hasOriginal, prepare, onChooseSource, onSubmitted, busy, setBusy, onClose }: Omit<PublishDialogProps, 'open' | 'onOpenChange'> & { busy: boolean; setBusy: (busy: boolean) => void; onClose: () => void }) {
  const t = zhCN.editorWorkspace.publish;
  const toast = useToast();
  const titleId = useId();
  const tagId = useId();
  const suggestions = useSuggestions();
  const [title, setTitle] = useState(designName.slice(0, TITLE_MAX));
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [consentOriginal, setConsentOriginal] = useState(false);
  const [consentRights, setConsentRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 修改后重投：服务端说上一版原图沿用不了，要先重新选择原图。 */
  const [needOriginal, setNeedOriginal] = useState(false);
  const attemptRef = useRef<{ key: string; submitKey: string; draft?: { revisionId: string; version: number }; uploaded?: boolean } | null>(null);

  const addTag = (raw: string) => {
    const name = normalizeTag(raw);
    setDraft('');
    if (!name || tags.length >= TAG_LIMIT || tags.some((tag) => tag.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) return;
    setTags((current) => [...current, name]);
  };
  const onTagKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      setTags((current) => current.slice(0, -1));
    }
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || Array.from(trimmed).length > TITLE_MAX) {
      setTitleInvalid(true);
      document.getElementById(titleId)?.focus();
      return;
    }
    const original = getOriginal();
    if (!original && !workId) return;
    setBusy(true);
    setError(null);
    // 同一次投稿重试时沿用幂等键与已建草稿，不重复建草稿、不重复上传原图（与投稿页一致）。
    const attempt = attemptRef.current ?? { key: randomId(), submitKey: randomId() };
    attemptRef.current = attempt;
    try {
      if (!attempt.draft) {
        if (!(await prepare())) {
          setError(t.notSynced);
          attemptRef.current = null;
          return;
        }
        const cloud = await createBeadhueApi().getDesign(designId);
        if (!cloud || cloud.deleted) {
          setError(t.notSynced);
          attemptRef.current = null;
          return;
        }
        const created = await postCommunityCommand(workId ? `/api/community/works/${workId}/revisions` : '/api/community/works', attempt.key, {
          designId,
          expectedDesignRevision: cloud.revision,
          title: trimmed,
          licenseVersion: COMMUNITY_LICENSE_VERSION,
          suggestedTags: tags,
          ...(workId ? { inheritOriginal: !original } : {}),
        });
        attempt.draft = { revisionId: String(created.revisionId), version: Number(created.version) };
        track({ name: 'community_submission_created', properties: {} });
      }
      if (original && !attempt.uploaded) {
        const bytes = original.type === 'heic' ? await convertHeicWithWasm(original.bytes) : original.bytes;
        await uploadRevisionOriginal(attempt.draft.revisionId, bytes);
        attempt.uploaded = true;
        track({ name: 'community_original_uploaded', properties: {} });
      }
      await postCommunityCommand(`/api/community/revisions/${attempt.draft.revisionId}/submit`, attempt.submitKey, { expectedVersion: attempt.draft.version });
      await discardPendingOriginal(designId).catch(() => undefined);
      track({ name: 'community_submission_submitted', properties: {} });
      attemptRef.current = null;
      toast(t.submitted);
      onSubmitted();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ORIGINAL_REQUIRED' && !original) {
        // 草稿已建好才在提交时被拒：撤回它，否则换好原图回来重投会被「已有草稿」挡住。
        const draft = attempt.draft;
        attemptRef.current = null;
        if (draft) await postCommunityCommand(`/api/community/revisions/${draft.revisionId}/withdraw`, randomId(), { expectedVersion: draft.version }).catch(() => undefined);
        setNeedOriginal(true);
        return;
      }
      if (!attempt.draft && isDefiniteCommunityRejection(caught)) attemptRef.current = null;
      const message = caught instanceof OriginalUploadError || caught instanceof ApiError ? caught.message : t.failed;
      setError(message || t.failed);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = (hasOriginal ? consentOriginal : Boolean(workId) && !needOriginal) && consentRights && !busy;
  return (
    <DialogContent size="md">
      <DialogHeader>
        <DialogTitle>{workId ? t.reviseTitle : t.title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {workId ? <p className="text-body-sm text-ink-3">{t.reviseHelp}</p> : null}
        <div className="flex items-start gap-4">
          <BeadImage pattern={pattern} alt={t.thumbAlt} lazy={false} pad={0.06} className="size-24 shrink-0 rounded-lg bg-bg-subtle max-md:size-18" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <label htmlFor={titleId} className="text-footnote font-semibold text-ink">{t.titleLabel}</label>
            <Input
              id={titleId}
              value={title}
              maxLength={TITLE_MAX}
              aria-invalid={titleInvalid || undefined}
              disabled={busy}
              onChange={(event) => { setTitle(event.target.value); if (titleInvalid && event.target.value.trim()) setTitleInvalid(false); }}
            />
            {titleInvalid ? <FormAlert>{t.titleError}</FormAlert> : null}
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={tagId} className="text-footnote font-semibold text-ink">{t.tags}</label>
          <div className="flex min-h-control-md flex-wrap items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 transition-[border-color,box-shadow] duration-state focus-within:border-accent focus-within:shadow-field-focus">
            {tags.map((tag) => (
              <RemovableChip key={tag} selected removeLabel={t.tagRemove(tag)} onRemove={() => setTags((current) => current.filter((entry) => entry !== tag))}>{tag}</RemovableChip>
            ))}
            <input
              id={tagId}
              value={draft}
              maxLength={TAG_MAX}
              disabled={busy || tags.length >= TAG_LIMIT}
              placeholder={t.tagPlaceholder}
              autoComplete="off"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onTagKey}
              className="h-7.5 min-w-24 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-4"
            />
          </div>
          <span className="text-caption font-normal text-ink-3">{t.tagHint}</span>
          {suggestions.some((name) => !tags.includes(name)) ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.filter((name) => !tags.includes(name)).map((name) => (
                <Chip key={name} variant="outline" aria-label={t.tagAdd(name)} disabled={busy || tags.length >= TAG_LIMIT} icon={<Plus aria-hidden="true" strokeWidth={1.75} />} onClick={() => addTag(name)}>
                  {name}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
        {hasOriginal ? (
          <>
            <Note icon={<Lock aria-hidden="true" strokeWidth={1.75} />}>{t.originalNote}</Note>
            <div className="grid gap-3">
              <Checkbox checked={consentOriginal} disabled={busy} onCheckedChange={(checked) => setConsentOriginal(checked === true)}>{t.consentOriginal}</Checkbox>
              <Checkbox checked={consentRights} disabled={busy} onCheckedChange={(checked) => setConsentRights(checked === true)}>{t.consentRights}</Checkbox>
              <Link href="/community/copyright" target="_blank" className="justify-self-start text-caption text-accent underline-offset-2 hover:underline">{t.rules}</Link>
            </div>
          </>
        ) : workId && !needOriginal ? (
          <div className="grid gap-3">
            <Note icon={<Lock aria-hidden="true" strokeWidth={1.75} />}>{t.reviseOriginal}</Note>
            <Checkbox checked={consentRights} disabled={busy} onCheckedChange={(checked) => setConsentRights(checked === true)}>{t.consentRights}</Checkbox>
            <Link href="/community/copyright" target="_blank" className="justify-self-start text-caption text-accent underline-offset-2 hover:underline">{t.rules}</Link>
          </div>
        ) : (
          <Note tone="warning" icon={<TriangleAlert aria-hidden="true" strokeWidth={1.75} />}>
            <p role={needOriginal ? 'alert' : undefined}>{needOriginal ? t.reviseNeedsOriginal : t.originalMissing}</p>
            <Button size="sm" className="mt-2" onClick={() => { onClose(); onChooseSource(); }}>
              <ImageIcon aria-hidden="true" strokeWidth={1.75} />
              {zhCN.editorWorkspace.reference.choose}
            </Button>
          </Note>
        )}
        {error ? <FormAlert>{error}</FormAlert> : null}
      </DialogBody>
      <DialogFooter>
        <Button disabled={busy} onClick={onClose}>{zhCN.editorWorkspace.cancel}</Button>
        <Button variant="primary" loading={busy} disabled={!canSubmit} onClick={() => void submit()}>{t.submit}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
