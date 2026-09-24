'use client';
import OriginalUploadStatus from '@/components/beadhue/OriginalUploadStatus';
import { Image as ImageIcon, RefreshCw, Send } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel, FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { COMMUNITY_LICENSE_VERSION, communitySnapshotFromProject, deriveCommunityPreview } from '@/lib/community/snapshot';
import { OriginalUploadError, uploadRevisionOriginal } from '@/lib/community/originalsClient';
import { convertHeicWithWasm } from '@/lib/image/decode';
import type { ImageType } from '@/lib/image/sniff';
import { validateImageFile } from '@/lib/image/validation';
import { createBeadhueApi } from '@/lib/sync/api';
import { ApiError, type CloudDesignFull, type CloudDesignMeta } from '@/lib/sync/clientAdapter';
import { discardPendingOriginal, takePendingOriginal } from '@/lib/storage/pendingOriginals';
import CommunityPreviewCanvas from './CommunityPreviewCanvas';
import { isDefiniteCommunityRejection, postCommunityCommand } from './communityCommand';
import { track } from '@/lib/analytics/client';
import { randomId } from '@/lib/ids';
import { zhCN } from '@/messages/zh-CN';
import { z } from 'zod';

const t = zhCN.communityAdmin.submission;
const linkClass = 'ml-1 text-ink underline underline-offset-2 hover:text-accent';
const uuid = z.uuid();

interface OriginalDraft { bytes: Uint8Array; type: ImageType; name: string; source: 'workbench' | 'file' }
interface Attempt {
  key: string;
  submitKey: string;
  payload: { designId: string; expectedDesignRevision: number; title: string; licenseVersion: string };
  draft?: { revisionId: string; version: number };
  /** 已成功上传的原图字节摘要（同一份原图不重复上传）。 */
  uploadedOriginal?: string;
}

async function post(url: string, key: string, payload: object, submitted?: { revisionId: string; version: number }) {
  const body = await postCommunityCommand(url, key, payload);
  if (typeof body.revisionId !== 'string' || !uuid.safeParse(body.revisionId).success || typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 1
    || (url === '/api/community/works' && !uuid.safeParse(body.workId).success)
    || (submitted ? body.revisionId !== submitted.revisionId || body.version !== submitted.version + 1 || body.status !== 'pending_review' : body.status !== 'draft' || body.version !== 1)) {
    throw new Error(zhCN.communityAdmin.submission.unknownResult);
  }
  return { revisionId: body.revisionId, version: body.version };
}

const originalFingerprint = (original: OriginalDraft) => `${original.name}:${original.bytes.byteLength}:${original.type}`;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function CommunitySubmitForm({ initialDesignId = '', displayName, workId }: {
  initialDesignId?: string; displayName: string; workId?: string;
}) {
  const router = useRouter();
  const [designs, setDesigns] = useState<CloudDesignMeta[]>([]);
  const [designId, setDesignId] = useState('');
  const [source, setSource] = useState<CloudDesignFull | null>(null);
  const [title, setTitle] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [original, setOriginal] = useState<OriginalDraft | null>(null);
  const [originalConsent, setOriginalConsent] = useState(false);
  const [originalError, setOriginalError] = useState<string | null>(null);
  const [originalUploaded, setOriginalUploaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [needsOriginal, setNeedsOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  // 原图预览：对象 URL 与 original 一同派生；HEIC 在多数浏览器无法直接显示，此时只显示文件名与大小。
  const previewUrl = useMemo(() => original && original.type !== 'heic'
    ? URL.createObjectURL(new Blob([new Uint8Array(original.bytes)], { type: `image/${original.type}` }))
    : null, [original]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selectSource = useCallback(async (id: string) => {
    const seq = ++generation.current;
    setDesignId(id); setSource(null); setAccepted(false); setTitle(''); setError(null);
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const value = await createBeadhueApi().getDesign(id);
      if (!mounted.current || generation.current !== seq) return;
      if (!value || value.deleted || !communitySnapshotFromProject(value.project)) throw new ApiError(400, 'VALIDATION', t.sourceInvalid);
      setSource(value); setTitle(value.name.slice(0, 80));
    } catch (caught) {
      if (mounted.current && generation.current === seq) setError(caught instanceof ApiError ? caught.message : t.previewFailed);
    } finally {
      if (mounted.current && generation.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void createBeadhueApi().listDesigns().then(async (items) => {
      if (!active) return;
      const available = items.filter((item) => !item.deleted);
      setDesigns(available);
      if (initialDesignId && !available.some((item) => item.id === initialDesignId)) {
        setError(t.sourceUnavailable);
        setLoading(false);
      } else if (initialDesignId) {
        // 工作台「公开到豆社」交接过来的会话原图
        const handed = await takePendingOriginal(initialDesignId);
        if (active && handed && !handed.sourceRevisionId) setOriginal({ bytes: new Uint8Array(handed.bytes), type: handed.type, name: handed.name, source: 'workbench' });
        await selectSource(initialDesignId);
      } else setLoading(false);
    }).catch(() => {
      if (active) { setError(t.loadFailed); setLoading(false); }
    });
    return () => { active = false; mounted.current = false; generation.current += 1; };
  }, [initialDesignId, selectSource]);

  const chooseOriginal = async (file: File | undefined) => {
    setOriginalError(null);
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateImageFile({ bytes, name: file.name });
    if (!validation.ok) { setOriginalError(zhCN.errors[validation.code]); return; }
    setOriginal({ bytes, type: validation.type, name: file.name, source: 'file' });
    if (attempt.current) attempt.current.uploadedOriginal = undefined;
    setOriginalUploaded(false);
    setNeedsOriginal(false);
  };

  const uploadOriginalIfNeeded = async (current: Attempt) => {
    if (!original || !current.draft) return;
    const fingerprint = originalFingerprint(original);
    if (current.uploadedOriginal === fingerprint) return;
    let bytes = original.bytes;
    if (original.type === 'heic') {
      // 转成 JPEG 再上传：引用者的浏览器未必能解码 HEIC。
      setBusyText(t.convertingOriginal);
      bytes = await convertHeicWithWasm(bytes);
    }
    setBusyText(t.uploadingOriginal);
    await uploadRevisionOriginal(current.draft.revisionId, bytes);
    current.uploadedOriginal = fingerprint;
    if (mounted.current) setOriginalUploaded(true);
    track({ name: 'community_original_uploaded', properties: {} });
  };

  // 编辑再投稿默认沿用上一版原图，不强制重新选择；首次投稿必须带原图并同意上传条款。
  const originalSatisfied = workId ? (!original || originalConsent) : Boolean(original && originalConsent);
  const canSubmit = Boolean(source) && title.trim().length > 0 && accepted && originalSatisfied && !(needsOriginal && !original);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current || (!attempt.current && !canSubmit) || (attempt.current && needsOriginal && !original)) return;
    pending.current = true; setBusy(true); setError(null); setLocked(true);
    const current = attempt.current ?? {
      key: randomId(), submitKey: randomId(),
      payload: { designId, expectedDesignRevision: source!.revision, title: title.trim(), licenseVersion: COMMUNITY_LICENSE_VERSION },
    };
    attempt.current = current;
    try {
      if (!current.draft) {
        setBusyText(t.creatingDraft);
        current.draft = await post(workId ? `/api/community/works/${workId}/revisions` : '/api/community/works', current.key, current.payload);
        if (!mounted.current) return;
        setHasDraft(true);
        track({ name: 'community_submission_created', properties: {} });
      }
      await uploadOriginalIfNeeded(current);
      if (!mounted.current) return;
      setBusyText(t.submitting);
      await post(`/api/community/revisions/${current.draft.revisionId}/submit`, current.submitKey, { expectedVersion: current.draft.version }, current.draft);
      if (!mounted.current) return;
      await discardPendingOriginal(designId).catch(() => undefined);
      track({ name: 'community_submission_submitted', properties: {} });
      router.push('/me/public');
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : t.failed;
      const originalRequired = (caught instanceof ApiError && caught.code === 'ORIGINAL_REQUIRED') || (caught instanceof OriginalUploadError);
      if (originalRequired) {
        setNeedsOriginal(true);
        setError(caught instanceof OriginalUploadError ? t.originalUploadFailed(message) : t.originalRequired);
      } else {
        setError(current.draft ? t.draftKept(message) : message);
      }
      // A definite validation rejection cannot have committed a draft; uncertain responses keep the original request.
      if (!current.draft && isDefiniteCommunityRejection(caught)) {
        attempt.current = null; setLocked(false); setAccepted(false);
        if (caught instanceof ApiError && caught.code === 'STATE_CONFLICT') setSource(null);
      }
    } finally {
      pending.current = false;
      if (mounted.current) { setBusy(false); setBusyText(null); }
    }
  };

  const preview = source ? deriveCommunityPreview(source.project.pattern) : null;
  const originalLocked = busy || (locked && originalUploaded);
  return (
    <form className="grid gap-6" onSubmit={(event) => void submit(event)}>
      <OriginalUploadStatus />
      <p className="text-body-sm text-ink-3">{workId ? t.editHelp : t.previewHelp}</p>
      <div className="grid gap-1.5">
        <FieldLabel>{t.chooseSource}</FieldLabel>
        <Select label={t.chooseSource} placeholder={t.choosePlaceholder} value={designId} disabled={loading || locked} onValueChange={(value) => void selectSource(value)} options={designs.map((design) => ({ value: design.id, label: design.name }))} />
        {loading ? <p role="status" className="text-caption font-normal text-ink-3">{t.loadingSources}</p> : null}
        {!loading && !designs.length && !error ? <p className="text-caption font-normal text-ink-3">{t.noSources}</p> : null}
      </div>
      {preview ? (
        <section aria-label={t.preview} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 rounded-lg bg-bg-subtle p-4 max-sm:grid-cols-1">
          <CommunityPreviewCanvas preview={preview} label={t.previewAria(title || source!.name)} />
          <div className="grid gap-1 text-body-sm text-ink-3">
            <strong className="text-title-3 text-ink">{title || source!.name}</strong>
            <p>{t.author}{displayName}</p>
            <p className="tabular-nums">{t.previewSize(preview.originalWidth, preview.originalHeight)}</p>
          </div>
        </section>
      ) : null}
      <Field label={t.title} disabled={!source || locked}>
        <Input value={title} maxLength={80} required onChange={(event) => setTitle(event.target.value)} />
      </Field>

      <fieldset data-slot="submission-original" className="grid gap-3" disabled={originalLocked} aria-describedby="submission-original-help">
        <legend className="mb-1 text-title-3 text-ink">{t.originalTitle}</legend>
        <p id="submission-original-help" className="text-body-sm text-ink-3">{workId ? t.originalEditHelp : t.originalHelp}</p>
        {original ? (
          <div data-slot="submission-original-card" className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-line p-3">
            {/* 本地对象 URL 预览，next/image 无法优化也不该上传 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previewUrl ? <img src={previewUrl} alt={t.originalPreviewAlt} className="size-20 rounded-md bg-bg-subtle object-cover" /> : <div className="grid size-20 place-items-center rounded-md bg-bg-muted text-caption text-ink-3">{original.type.toUpperCase()}</div>}
            <div className="grid min-w-0 justify-items-start gap-1">
              <strong className="max-w-full truncate text-body-sm text-ink">{original.name}</strong>
              <p className="text-caption font-normal text-ink-3">{formatBytes(original.bytes.byteLength)} · {original.source === 'workbench' ? t.originalFromWorkbench : t.originalFromFile}</p>
              {!originalLocked ? <Button variant="ghost" size="sm" onClick={() => { setOriginal(null); setOriginalConsent(false); }}><RefreshCw aria-hidden="true" strokeWidth={1.75} />{t.originalReplace}</Button> : null}
            </div>
          </div>
        ) : (
          <label className="grid justify-items-start gap-2">
            <input type="file" className="peer sr-only" accept="image/*,.heic,.heif" disabled={originalLocked} onChange={(event) => { void chooseOriginal(event.target.files?.[0]); event.target.value = ''; }} />
            <span className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer peer-focus-visible:focus-ring')}><ImageIcon aria-hidden="true" strokeWidth={1.75} />{t.chooseOriginal}</span>
            <small className="text-caption font-normal text-ink-3">{t.originalPickerHint}</small>
          </label>
        )}
        <FormAlert>{originalError}</FormAlert>
        {needsOriginal && !original ? <FormAlert>{t.originalRequired}</FormAlert> : null}
        {original ? (
          <Checkbox checked={originalConsent} disabled={originalLocked} onCheckedChange={(checked) => setOriginalConsent(checked)}>
            <span>{t.originalConsent}<Link href="/privacy" className={linkClass}>{t.originalConsentLink}</Link></span>
          </Checkbox>
        ) : null}
      </fieldset>

      <Checkbox checked={accepted} disabled={!source || locked} onCheckedChange={(checked) => setAccepted(checked)}>
        <span>{t.license}<Link href="/community/copyright" className={linkClass}>{t.copyright}</Link></span>
      </Checkbox>
      {error ? (
        <div className="grid justify-items-start gap-2">
          <FormAlert>{error}</FormAlert>
          {!locked ? <Button size="sm" onClick={() => designId ? void selectSource(designId) : window.location.reload()}><RefreshCw aria-hidden="true" strokeWidth={1.75} />{t.reloadPreview}</Button> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={hasDraft || locked ? '/me/public' : '/me'} className={buttonVariants({ variant: 'ghost' })}>{hasDraft || locked ? t.mine : t.back}</Link>
        <Button type="submit" variant="primary" loading={busy} disabled={busy || loading || (!locked && !canSubmit) || (locked && needsOriginal && !original)}>
          {busy ? null : <Send aria-hidden="true" strokeWidth={1.75} />}{busy ? (busyText ?? t.submitting) : hasDraft ? t.retryReview : locked ? t.retryOriginal : t.submit}
        </Button>
      </div>
    </form>
  );
}
