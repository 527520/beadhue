'use client';

/** 注册页（spec §F9）：客户端 schema 校验 + 服务端错误展示；错误挂在对应字段下，文案不变。 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import DevMailLink from '@/components/auth/DevMailLink';
import FormError from '@/components/auth/FormError';
import { Button } from '@/components/ui/button';
import { Field, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { zhCN } from '@/messages/zh-CN';
import { registerSchema } from '@/lib/schemas';
import { DEV_MAIL_LINK_HEADER } from '@/lib/auth/mailMeta';
import { LIMITS } from '@/lib/appInfo';
import { track } from '@/lib/analytics/client';
import { authPageHref, isAdminReturnTo } from '@/lib/auth/returnTo';
import { useAuthReturnTo } from '@/components/auth/useAuthReturnTo';

type FieldName = 'username' | 'email' | 'password' | 'confirm' | 'form';
type Errors = Partial<Record<FieldName, string>>;

const linkClass = 'font-medium text-accent hover:underline hover:underline-offset-3';

export default function RegisterPage() {
  const t = zhCN.authPages;
  const next = useAuthReturnTo();
  const returnTo = isAdminReturnTo(next) ? '/me' : next;
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [devMailLink, setDevMailLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (requestPending.current) return;
    setErrors({});
    const parsed = registerSchema.safeParse({ email, password, username });
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      setErrors({ [path === 'username' || path === 'password' ? path : 'email']: t.credentialsInvalid });
      return;
    }
    if (password !== confirm) {
      setErrors({ confirm: t.passwordMismatch });
      return;
    }
    requestPending.current = true;
    setPending(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        track({ name: 'auth_registered', properties: {} });
        setDone(true);
        // 开发邮件模式：服务端把验证链接放在响应头里，直接展示给用户（正式环境为 null）
        setDevMailLink(res.headers.get(DEV_MAIL_LINK_HEADER));
        return;
      }
      const body = await res.json().catch(() => null);
      const message = body?.error?.message;
      if (body?.error?.code === 'CONFLICT') setErrors({ email: zhCN.auth.emailTaken });
      else if (body?.error?.code === 'RATE_LIMITED') setErrors({ form: zhCN.auth.tooManyRequests });
      else setErrors({ form: message || t.registerFailed });
    } catch {
      setErrors({ form: t.networkError });
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  };

  if (done) {
    return (
      <AuthShell title={t.registerTitle} description={t.registerHint}>
        <div className="grid gap-4">
          <FormNotice>{t.registeredSent}</FormNotice>
          <DevMailLink href={devMailLink} />
          <Link href={authPageHref('login', returnTo)} className={`${linkClass} text-center text-body-sm`}>
            {t.goLogin}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.registerTitle} description={t.registerHint}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label={t.usernameOptional} error={errors.username}>
          <Input type="text" autoComplete="nickname" disabled={pending} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={LIMITS.usernameLength} />
        </Field>
        <Field label={t.email} error={errors.email}>
          <Input type="email" autoComplete="email" disabled={pending} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t.password} hint={t.passwordRule} error={errors.password}>
          <Input type="password" autoComplete="new-password" disabled={pending} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label={t.confirmPassword} error={errors.confirm}>
          <Input type="password" autoComplete="new-password" disabled={pending} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <FormError message={errors.form ?? null} />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.registerSubmit}
        </Button>
        <p className="text-center text-body-sm">
          <Link href={authPageHref('login', returnTo)} className={linkClass}>
            {t.hasAccount}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
