'use client';

import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { useId, useState } from 'react';
import { track } from '@/lib/analytics/client';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const t = zhCN.detail;
const REASONS = ['copyright', 'inappropriate', 'spam', 'other'] as const;
type Reason = (typeof REASONS)[number];
/** 四类原因映射到举报接口的分类；「不适宜内容」（色情、暴力、令人不适）归入明确伤害。 */
const CATEGORY: Record<Reason, 'copyright' | 'harm' | 'spam' | 'other'> = { copyright: 'copyright', inappropriate: 'harm', spam: 'spam', other: 'other' };
const NOTE_MAX = 300;

export interface ReportTarget { targetType: 'work' | 'comment'; targetId: string }

/** 举报弹窗：四选一原因卡片 + 选填说明（选「其他」时必填）；手机为底部面板。 */
export function ReportDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {target ? <ReportForm key={`${target.targetType}:${target.targetId}`} target={target} onDone={onClose} /> : null}
    </Dialog>
  );
}

function ReportForm({ target, onDone }: { target: ReportTarget; onDone: () => void }) {
  const toast = useToast();
  const noteId = useId();
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsNote = reason === 'other';
  const ready = reason !== null && (!needsNote || note.trim().length > 0);
  const submit = async () => {
    if (!ready || pending || !reason) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/community/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...target, category: CATEGORY[reason], ...(note.trim() ? { details: note.trim() } : {}) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? t.reportFailed);
      }
      track({ name: 'community_report_created', properties: { targetType: target.targetType, reasonCategory: CATEGORY[reason] === 'harm' ? 'explicit_harm' : CATEGORY[reason] } });
      toast(t.reported);
      onDone();
    } catch (reasonError) {
      setError(reasonError instanceof Error && !(reasonError instanceof TypeError) ? reasonError.message : t.reportFailed);
    } finally {
      setPending(false);
    }
  };
  return (
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{target.targetType === 'comment' ? t.reportComment : t.reportWork}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        <BaseRadioGroup aria-labelledby={`${noteId}-legend`} value={reason} onValueChange={(value) => setReason(value as Reason)} className="grid gap-2">
          <span id={`${noteId}-legend`} className="mb-0.5 text-footnote font-medium text-ink">{t.reportReason}</span>
          {REASONS.map((value) => {
            const [label, text] = t.reasons[value];
            return (
              <label
                key={value}
                className={cn(
                  'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md px-4 py-3 inset-ring-1 inset-ring-line-strong transition-[box-shadow,background-color] duration-state ease-standard hover:inset-ring-ink-3',
                  'has-data-checked:bg-bg-subtle has-data-checked:inset-ring-2 has-data-checked:inset-ring-ink',
                )}
              >
                <BaseRadio.Root value={value} className="mt-0.5 grid size-4.5 place-items-center rounded-full border-control border-line-strong bg-bg transition-colors duration-state focus-visible:focus-ring data-checked:border-6 data-checked:border-ink" />
                <span>
                  <span className="block text-body-sm font-semibold text-ink">{label}</span>
                  <span className="block text-caption font-normal text-ink-3">{text}</span>
                </span>
              </label>
            );
          })}
        </BaseRadioGroup>
        <div className="grid gap-1.5">
          <label htmlFor={noteId} className="text-footnote font-medium text-ink">
            {t.reportNote}<span className="ml-2 font-normal text-ink-3">{t.optional}</span>
          </label>
          <Textarea
            id={noteId}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.reportNotePlaceholder}
            aria-describedby={needsNote ? `${noteId}-hint` : undefined}
          />
          {needsNote ? <span id={`${noteId}-hint`} className="text-caption font-normal text-ink-3">{t.reportNoteRequired}</span> : null}
        </div>
        <FormAlert>{error}</FormAlert>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="secondary" />}>{t.cancel}</DialogClose>
        <Button variant="primary" disabled={!ready} loading={pending} onClick={() => void submit()}>{t.reportSubmit}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
