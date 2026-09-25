'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { isValidEmail } from '@/lib/emailFormat';
import { track } from '@/lib/analytics/client';
import { notifyAuthStatusChanged } from '@/components/account/useAuthStatus';
import { Button } from '@/components/ui/button';
import { Field, FormAlert } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const t = zhCN.shell.loginDialog;

export interface LoginFormProps {
  /** 登录成功（emailVerified 为 false 时表单自己提示去验证，不再调用）。 */
  onSuccess: () => void;
  /** 注册入口；null 不显示（后台回跳、回跳尚未解析）。 */
  registerHref: string | null;
  forgotHref: string;
  /** 注册入口旁的补充说明（后台账号无法自行注册）。 */
  notice?: React.ReactNode;
  autoFocus?: boolean;
  /** 未验证邮箱时是否拦下（弹窗拦下并提示；登录页沿用原来的跳转逻辑）。 */
  blockUnverified?: boolean;
}

type Errors = { email?: string; password?: string; form?: string };

/** 登录表单：登录弹窗与 /login 页共用；错误挂在字段下。 */
export function LoginForm({ onSuccess, registerHref, forgotHref, notice, autoFocus, blockUnverified = false }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [unverified, setUnverified] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const next: Errors = {};
    if (!isValidEmail(email)) next.email = t.emailInvalid;
    if (!password) next.password = t.passwordRequired;
    setErrors(next);
    setUnverified(false);
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
    inFlight.current = true;
    setPending(true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { emailVerified?: boolean } | null;
        track({ name: 'login_succeeded', properties: {} });
        notifyAuthStatusChanged();
        if (blockUnverified && body?.emailVerified === false) { setUnverified(true); return; }
        onSuccess();
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const code = body?.error?.code;
      if (code === 'RATE_LIMITED') setErrors({ form: zhCN.auth.tooManyRequests });
      else if (code === 'VALIDATION' || code === 'UNAUTHORIZED') setErrors({ password: zhCN.auth.invalidCredentials });
      else setErrors({ form: body?.error?.message || zhCN.auth.invalidCredentials });
    } catch {
      setErrors({ form: zhCN.authPages.networkError });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <form data-login-form="" noValidate onSubmit={submit} className="grid gap-4">
      <Field label={t.email} error={errors.email}>
        <Input ref={emailRef} type="email" name="email" autoComplete="email" placeholder={t.emailPlaceholder} autoFocus={autoFocus} disabled={pending} value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label={t.password} error={errors.password} labelAside={<Link href={forgotHref} className="text-body-sm font-medium text-accent hover:underline hover:underline-offset-3">{t.forgot}</Link>}>
        <Input ref={passwordRef} type="password" name="password" autoComplete="current-password" disabled={pending} value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <FormAlert>{errors.form}</FormAlert>
      {unverified ? (
        <p role="alert" className="text-footnote text-warning">
          {t.unverified} <Link href="/me/settings" className="font-medium text-accent hover:underline">{t.openSettings}</Link>
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" block loading={pending}>{t.submit}</Button>
      {notice}
      {registerHref ? (
        <p className="text-center text-body-sm text-ink-3">
          {t.noAccount}
          <Link href={registerHref} className="font-medium text-accent hover:underline hover:underline-offset-3">{t.register}</Link>
        </p>
      ) : null}
    </form>
  );
}
