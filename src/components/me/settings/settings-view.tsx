'use client';

import { ArrowLeft, BadgeCheck, ChevronDown, CircleAlert, LogOut, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/appInfo';
import { track } from '@/lib/analytics/client';
import { emailSchema, passwordSchema, usernameSchema } from '@/lib/schemas';
import { createBeadhueApi } from '@/lib/sync/api';
import { ApiError } from '@/lib/sync/clientAdapter';
import { zhCN } from '@/messages/zh-CN';
import { chooseAnalyticsConsent, useAnalyticsPreference } from '@/components/analytics/AnalyticsConsent';
import { notifyAuthStatusChanged } from '@/components/account/useAuthStatus';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { AVATAR_PICKER_COLORS } from '@/lib/render/beadTokens';
import { useLoginDialog } from '@/components/shell/login-dialog';
import { relativeTime } from '@/lib/format';
import { ConfirmDialog } from '../confirm-dialog';
import { formatBytes, formatGb, usagePercent } from '../format';
import { useMe, type MeViewer } from '../me-context';
import { useOriginalUsage } from '../use-original-usage';

const t = zhCN.me.settings;
const SECTIONS = ['profile', 'security', 'storage', 'privacy', 'danger'] as const;
type SectionId = (typeof SECTIONS)[number];
const icon = (Icon: typeof LogOut) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const fieldError = (error: unknown) => (error instanceof ApiError ? error : null);

function Card({ id, title, description, danger, children }: { id?: SectionId; title: string; description?: string; danger?: boolean; children: ReactNode }) {
  return (
    <section id={id} data-section={id} aria-labelledby={id ? `h-${id}` : undefined} className={cn('scroll-mt-24 rounded-lg border bg-bg p-6 max-md:p-5', danger ? 'border-danger/28' : 'border-line')}>
      <header className="mb-5 grid gap-1">
        <h2 id={id ? `h-${id}` : undefined} tabIndex={-1} className={cn('text-title-3 outline-none', danger ? 'text-danger' : 'text-ink')}>{title}</h2>
        {description ? <p className="text-body-sm text-ink-3">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Row({ title, description, children, extra, htmlFor }: { title: string; description: ReactNode; children?: ReactNode; extra?: ReactNode; htmlFor?: string }) {
  const text = (
    <>
      <span className="text-body font-semibold text-ink">{title}</span>
      <span className="text-body-sm text-ink-3">{description}</span>
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line py-4 first-of-type:border-t-0 first-of-type:pt-0 last:pb-0">
      {htmlFor ? <label htmlFor={htmlFor} className="grid min-w-0 grow basis-40 cursor-pointer gap-1">{text}</label> : <div className="grid min-w-0 grow basis-40 gap-1">{text}</div>}
      {children}
      {extra}
    </div>
  );
}

/** 头像颜色：八颗豆色，桌面浮层、手机底部面板；选完回到表单，与用户名一起保存。 */
function AvatarColorPicker({ value, onChange }: { value: string | null; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={t.avatarColorTitle}>
      <PopoverTrigger render={<Button type="button" size="sm" variant="outline" />}>{t.changeAvatarColor}</PopoverTrigger>
      <PopoverContent align="start" aria-label={t.avatarColorTitle}>
        <div role="group" aria-label={t.avatarColorTitle} className="grid grid-cols-4 gap-3 p-2 max-md:justify-center">
          {AVATAR_PICKER_COLORS.map((color, index) => (
            <Tooltip key={color} content={t.avatarColorNames[index]} side="top">
              <button
                type="button"
                aria-label={t.avatarColorNames[index]}
                aria-pressed={value?.toUpperCase() === color}
                onClick={() => { onChange(color); setOpen(false); }}
                className="size-control-md rounded-full inset-ring-1 inset-ring-ink/10 transition-transform duration-press hover:scale-108 focus-visible:focus-ring aria-pressed:ring-2 aria-pressed:ring-ink aria-pressed:ring-offset-2 aria-pressed:ring-offset-bg"
                style={{ backgroundColor: color }}
              />
            </Tooltip>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProfileCard({ viewer }: { viewer: MeViewer }) {
  const api = useMemo(() => createBeadhueApi(), []);
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState({ name: viewer.username ?? '', color: viewer.avatarColor });
  const [value, setValue] = useState(saved.name);
  const [color, setColor] = useState(viewer.avatarColor);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameChanged = value.trim() !== saved.name;
  const colorChanged = color !== saved.color;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (!nameChanged && !colorChanged)) return;
    const parsed = usernameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? zhCN.me.actionFailed);
      return;
    }
    setBusy(true);
    try {
      await api.updateProfile({ ...(nameChanged ? { username: parsed.data } : {}), ...(colorChanged ? { avatarColor: color } : {}) });
      setSaved({ name: parsed.data, color });
      setValue(parsed.data);
      toast(t.profileSaved);
      notifyAuthStatusChanged();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : zhCN.me.actionFailed);
    } finally {
      setBusy(false);
    }
  };
  const preview = value.trim() || viewer.email.split('@')[0] || viewer.email;
  return (
    <Card id="profile" title={t.sections.profile} description={t.profileDesc}>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex items-start gap-6 max-md:flex-col max-md:gap-4">
        <div className="grid shrink-0 justify-items-center gap-3 max-md:grid-flow-col max-md:items-center">
          <Avatar id={viewer.avatarId} name={preview} color={color ?? undefined} size="xl" />
          <AvatarColorPicker value={color} onChange={setColor} />
        </div>
        <Field label={t.username} hint={t.usernameHint} error={error} className="w-full min-w-0 flex-1">
          <div className="flex gap-2">
            <Input value={value} maxLength={LIMITS.usernameLength} autoComplete="nickname" className="min-w-0 flex-1" onChange={(event) => { setValue(event.target.value); setError(null); }} />
            <Button type="submit" loading={busy} disabled={!nameChanged && !colorChanged}>{zhCN.me.save}</Button>
          </div>
        </Field>
      </form>
    </Card>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const api = useMemo(() => createBeadhueApi(), []);
  const toast = useToast();
  const [values, setValues] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const validate = () => {
    const next: Record<string, string> = {};
    if (!values.current) next.current = t.currentRequired;
    const parsed = passwordSchema.safeParse(values.next);
    if (!parsed.success) next.next = parsed.error.issues[0]?.message ?? t.newPasswordHint;
    else if (values.next === values.current) next.next = t.samePassword;
    if (!values.confirm) next.confirm = t.confirmRequired;
    else if (values.confirm !== values.next) next.confirm = t.mismatch;
    return next;
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.changePassword(values.current, values.next);
      toast(t.passwordChanged);
      onClose();
    } catch (caught) {
      const apiError = fieldError(caught);
      if (apiError?.field === 'currentPassword') setErrors({ current: apiError.message });
      else setFormError(caught instanceof Error ? caught.message : zhCN.me.actionFailed);
    } finally {
      setBusy(false);
    }
  };
  const field = (name: keyof typeof values, label: string, autoComplete: string, hint?: string) => (
    <Field label={label} hint={hint} error={errors[name]}>
      <Input type="password" autoComplete={autoComplete} value={values[name]} onChange={(event) => { setValues((current) => ({ ...current, [name]: event.target.value })); setErrors((current) => ({ ...current, [name]: '' })); }} />
    </Field>
  );
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{t.changePassword}</DialogTitle></DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="contents">
          <DialogBody className="grid gap-4">
            {field('current', t.currentPassword, 'current-password')}
            {field('next', t.newPassword, 'new-password', t.newPasswordHint)}
            {field('confirm', t.confirmPassword, 'new-password')}
            <FormAlert>{formError}</FormAlert>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={onClose}>{zhCN.me.cancel}</Button>
            <Button type="submit" variant="primary" loading={busy}>{t.changePassword}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SessionItem { current: boolean; createdAt: string; label: string | null }

function SecurityCard({ viewer }: { viewer: MeViewer }) {
  const toast = useToast();
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [devices, setDevices] = useState<SessionItem[] | 'error' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [now, setNow] = useState(0);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/me/sessions', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      setDevices(((await response.json()) as { items: SessionItem[] }).items);
      setNow(Date.now());
    } catch {
      setDevices('error');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const others = Array.isArray(devices) ? devices.filter((item) => !item.current).length : 0;
  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/me/sessions/revoke-others', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(String(response.status));
      const { revoked } = (await response.json()) as { revoked: number };
      setConfirming(false);
      toast(t.signedOutOthers(revoked), { icon: icon(LogOut) });
      await load();
    } catch {
      setError(zhCN.me.actionFailed);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setLoggingOut(true);
    try {
      await createBeadhueApi().logout();
      track({ name: 'logout_succeeded', properties: {} });
      notifyAuthStatusChanged();
      toast(t.loggedOut);
      router.push('/');
      router.refresh();
    } catch {
      toast(t.logoutFailed, { icon: icon(CircleAlert) });
      setLoggingOut(false);
    }
  };
  const devicesText = devices === 'error' ? t.devicesUnknown : !devices ? '…' : devices.length > 1 ? t.devicesMany(devices.length) : t.devicesOne;
  return (
    <Card id="security" title={t.sections.security}>
      <Row title={t.email} description={viewer.email}>
        <Badge tone="success">{icon(BadgeCheck)}{t.verified}</Badge>
      </Row>
      <Row title={t.password} description={viewer.passwordChangedAt && now ? t.passwordChangedAt(relativeTime(viewer.passwordChangedAt, now)) : t.passwordDesc}>
        <Button variant="outline" onClick={() => setChanging(true)}>{t.changePassword}</Button>
      </Row>
      <Row
        title={t.devices}
        description={devicesText}
        extra={Array.isArray(devices) && devices.length > 0 ? (
          <details className="group basis-full">
            <summary className="-ml-2 inline-flex h-control-sm cursor-pointer list-none items-center gap-1 rounded-full px-2 text-body-sm font-medium text-ink-2 transition-colors duration-state hover:bg-bg-muted hover:text-ink focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
              {t.showDevices}
              <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 transition-transform duration-state group-open:rotate-180" />
            </summary>
            <ul className="mt-2 rounded-md bg-bg-subtle">
              {devices.map((item, index) => (
                <li key={`${item.createdAt}-${index}`} className="flex min-h-12 items-center gap-3 border-t border-line px-4 py-2 text-body-sm text-ink-2 first:border-t-0">
                  <span className="min-w-0 flex-1 truncate">{item.label ?? (item.current ? t.thisDevice : t.otherDevice)}</span>
                  {item.current ? <Badge>{t.currentDevice}</Badge> : null}
                  <span className="shrink-0 text-ink-3">{t.signedInAt(relativeTime(item.createdAt, now))}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      >
        <Button variant="outline" disabled={others === 0} onClick={() => { setError(null); setConfirming(true); }}>{t.signOutOthers}</Button>
      </Row>
      <Row title={t.logout} description={t.logoutDesc}>
        <Button variant="outline" loading={loggingOut} onClick={() => void logout()}>{icon(LogOut)}{t.logout}</Button>
      </Row>
      {changing ? <PasswordDialog onClose={() => { setChanging(false); void load(); router.refresh(); }} /> : null}
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={t.signOutOthersTitle} description={t.signOutOthersText(others)} confirmLabel={t.signOutOthers} busy={busy} error={error} onConfirm={() => void revoke()} />
    </Card>
  );
}

interface OriginalItem { designId: string; name: string; revision: number; byteSize: number; width: number | null; height: number | null }

function OriginalsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<OriginalItem[] | 'error' | null>(null);
  const [target, setTarget] = useState<OriginalItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/originals/designs', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      setItems(((await response.json()) as { items: OriginalItem[] }).items);
    } catch {
      setItems('error');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const drop = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/designs/${target.designId}/original`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseRevision: target.revision }) });
      if (!response.ok) throw new Error(response.status === 409 ? t.originalConflict : zhCN.me.actionFailed);
      setTarget(null);
      toast(t.originalDeleted, { icon: icon(Trash2) });
      onChanged();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : zhCN.me.actionFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{t.originalsTitle}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-3">
          {items === 'error' ? <FormAlert>{t.storageUnknown}</FormAlert> : !items ? <p role="status" className="text-body-sm text-ink-3">…</p> : (
            <>
              <p className="text-body-sm text-ink-3">{t.originalsSummary(items.length)}</p>
              {items.length ? (
                <ul>
                  {items.map((item) => (
                    <li key={item.designId} className="flex items-center gap-3 border-t border-line py-3">
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-body-sm font-semibold text-ink">{item.name}</span>
                        <span className="text-caption font-normal text-ink-3 tabular-nums">{item.width && item.height ? t.originalMeta(formatBytes(item.byteSize), item.width, item.height) : formatBytes(item.byteSize)}</span>
                      </div>
                      <Button size="sm" variant="danger-ghost" onClick={() => { setError(null); setTarget(item); }}>{t.deleteOriginal}</Button>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-4 text-body-sm text-ink-3">{t.originalsEmpty}</p>}
            </>
          )}
        </DialogBody>
      </DialogContent>
      <ConfirmDialog open={target !== null} onOpenChange={(open) => { if (!open) setTarget(null); }} title={t.deleteOriginalTitle} description={target ? t.deleteOriginalText(target.name) : ''} confirmLabel={t.deleteOriginal} danger busy={busy} error={error} onConfirm={() => void drop()} />
    </Dialog>
  );
}

function StorageCard() {
  const { usage, reload } = useOriginalUsage(true);
  const [managing, setManaging] = useState(false);
  const ready = usage && usage !== 'error' ? usage : null;
  const percent = ready ? usagePercent(ready.bytes, ready.quotaBytes) : 0;
  const full = percent >= 80;
  return (
    <Card id="storage" title={t.sections.storage} description={t.storageDesc}>
      {usage === 'error' ? <p className="text-body-sm text-ink-3">{t.storageUnknown}</p> : (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-title-2 text-ink tabular-nums">{ready ? t.storageUsed(formatGb(ready.bytes)) : '…'}</span>
            {ready ? <span className="text-body-sm text-ink-3 tabular-nums">{t.storageTotal(formatGb(ready.quotaBytes), percent)}</span> : null}
          </div>
          <div role="progressbar" aria-label={t.storageMeter} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
            <i className={cn('block h-full rounded-full transition-[width] duration-state', full ? 'bg-warning' : 'bg-ink')} style={{ width: `${percent}%` }} />
          </div>
          <p className={cn('flex items-center gap-2 text-body-sm [&>svg]:size-4 [&>svg]:shrink-0', full ? 'text-warning' : 'text-ink-3')}>
            {full ? icon(TriangleAlert) : null}
            <span>{full ? t.storageWarning : t.storageNote}</span>
          </p>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => setManaging(true)}>{t.manageOriginals}</Button>
      </div>
      {managing ? <OriginalsDialog onClose={() => setManaging(false)} onChanged={() => void reload()} /> : null}
    </Card>
  );
}

function PrivacyCard() {
  const toast = useToast();
  const { preference, ready, saving, message, error } = useAnalyticsPreference();
  const pending = preference === 'withdrawn';
  const on = preference === 'granted' && !error;
  return (
    <Card id="privacy" title={t.sections.privacy}>
      <Row title={t.privacyTitle} description={pending ? zhCN.communityAdmin.consentRecovery.pending : t.privacyDesc}>
        <Switch
          aria-label={t.privacyTitle}
          checked={on}
          disabled={!ready || saving || pending}
          onCheckedChange={(checked) => {
            void chooseAnalyticsConsent(checked ? 'granted' : preference === 'granted' ? 'withdrawn' : 'denied').then((ok) => {
              if (ok) toast(checked ? t.analyticsOn : t.analyticsOff);
            });
          }}
        />
      </Row>
      {pending ? <div className="mt-3"><Button size="sm" disabled={saving} onClick={() => void chooseAnalyticsConsent('withdrawn')}>{zhCN.communityAdmin.consentRecovery.retry}</Button></div> : null}
      {error && message ? <p role="alert" className="mt-3 text-footnote text-danger">{message}</p> : null}
    </Card>
  );
}

function DeleteAccountDialog({ viewer, designs, works, onClose }: { viewer: MeViewer; designs: number; works: number; onClose: () => void }) {
  const api = useMemo(() => createBeadhueApi(), []);
  const toast = useToast();
  const router = useRouter();
  const expected = viewer.username?.trim() || viewer.email;
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const ready = typed.trim() === expected && password.length > 0;
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      toast(t.accountDeleted);
      notifyAuthStatusChanged();
      router.push('/');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : zhCN.me.actionFailed);
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{t.deleteAccountTitle}</DialogTitle></DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="contents">
          <DialogBody className="grid gap-4">
            <p className="text-body text-ink-2">{t.deleteAccountIntro}</p>
            <ul className="grid list-disc gap-1 pl-5 text-body-sm text-ink-2">
              {t.deleteAccountItems(designs).map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="text-body-sm text-ink-3">{t.deleteAccountKeep(works)}</p>
            <Field label={viewer.username?.trim() ? t.confirmName(expected) : t.confirmEmail(expected)}>
              <Input value={typed} autoComplete="off" spellCheck={false} disabled={busy} onChange={(event) => setTyped(event.target.value)} />
            </Field>
            <Field label={t.accountPassword} error={error}>
              <Input type="password" value={password} autoComplete="current-password" disabled={busy} onChange={(event) => { setPassword(event.target.value); setError(null); }} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={onClose}>{zhCN.me.cancel}</Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!ready}>{t.deleteAccount}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DangerCard({ viewer }: { viewer: MeViewer }) {
  const { stats } = useMe();
  const [open, setOpen] = useState(false);
  return (
    <Card id="danger" title={t.sections.danger} danger>
      <Row title={t.deleteAccount} description={t.deleteAccountDesc}>
        <Button variant="danger-outline" onClick={() => setOpen(true)}>{t.deleteAccount}</Button>
      </Row>
      {open ? <DeleteAccountDialog viewer={viewer} designs={stats?.designs ?? 0} works={stats?.publicWorks ?? 0} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function UnverifiedCard() {
  const api = useMemo(() => createBeadhueApi(), []);
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || cooldown > 0) return;
    if (!emailSchema.safeParse(email).success) {
      setError(zhCN.authPages.emailInvalid);
      return;
    }
    setBusy(true);
    try {
      await api.resendVerification(email);
      toast(t.resent);
      setCooldown(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : zhCN.me.actionFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t.unverifiedTitle} description={t.unverifiedText}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Field label={t.email} error={error}>
          <div className="flex gap-2">
            <Input type="email" value={email} autoComplete="email" className="min-w-0 flex-1" onChange={(event) => { setEmail(event.target.value); setError(null); }} />
            <Button type="submit" loading={busy} disabled={cooldown > 0}>{cooldown > 0 ? t.resendCooldown(cooldown) : t.resend}</Button>
          </div>
        </Field>
      </form>
    </Card>
  );
}

/**
 * 账号设置：桌面左侧分区导航（滚动高亮），右侧卡片——个人资料、登录与安全、原图空间、隐私、危险区域。
 * 现有账号接口与业务不变：注销仍要当前密码，另加输入用户名确认；公开作品按既有规则保留并匿名署名。
 */
export function SettingsView() {
  const { viewer } = useMe();
  const login = useLoginDialog();
  const router = useRouter();
  const [active, setActive] = useState<SectionId>('profile');
  const verified = Boolean(viewer?.verified);
  useEffect(() => {
    if (!verified || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActive((entry.target as HTMLElement).dataset.section as SectionId);
    }, { rootMargin: '-35% 0px -60% 0px' });
    for (const id of SECTIONS) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [verified]);
  const jump = (id: SectionId) => {
    const node = document.getElementById(id);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById(`h-${id}`)?.focus({ preventScroll: true });
    setActive(id);
  };

  let cards: ReactNode;
  if (!viewer) {
    cards = (
      <>
        <section className="rounded-lg border border-line bg-bg">
          <EmptyState compact kind="empty" title={t.guestTitle} description={t.guestText} actions={<Button onClick={() => login?.open({ onSuccess: () => router.refresh() })}>{zhCN.me.login}</Button>} />
        </section>
        <PrivacyCard />
      </>
    );
  } else if (!verified) {
    cards = <><UnverifiedCard /><PrivacyCard /></>;
  } else {
    cards = <><ProfileCard viewer={viewer} /><SecurityCard viewer={viewer} /><StorageCard /><PrivacyCard /><DangerCard viewer={viewer} /></>;
  }

  return (
    <div data-ui="" className="page-container py-8 max-md:pt-4">
      <header className="mb-6 grid justify-items-start gap-2 max-md:sr-only">
        <Link href="/me" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-3 max-md:hidden')}>{icon(ArrowLeft)}{t.back}</Link>
        <h1 className="text-title-1 text-ink">{t.title}</h1>
      </header>
      <div className={cn('grid items-start gap-10', verified ? 'lg:grid-cols-[200px_minmax(0,760px)]' : 'grid-cols-[minmax(0,760px)]')}>
        {verified ? (
          <nav aria-label={t.nav} className="sticky top-22 grid gap-1 max-lg:hidden">
            {SECTIONS.map((id) => (
              <button key={id} type="button" aria-current={active === id ? 'true' : undefined} onClick={() => jump(id)} className="flex h-control-md items-center rounded-md px-3 text-left text-body-sm text-ink-3 transition-colors duration-state hover:bg-bg-muted hover:text-ink focus-visible:focus-ring aria-[current=true]:bg-bg-muted aria-[current=true]:font-semibold aria-[current=true]:text-ink">
                {t.sections[id]}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="grid min-w-0 gap-5 max-md:gap-4">{cards}</div>
      </div>
    </div>
  );
}
