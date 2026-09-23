'use client';

/** 重置密码页（spec §F9、边界 E32）：令牌一次性，成功后提示旧会话失效。 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import FormError from '@/components/auth/FormError';
import { Button } from '@/components/ui/button';
import { Field, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { zhCN } from '@/messages/zh-CN';
import { passwordSchema } from '@/lib/schemas';
import { authPageHref } from '@/lib/auth/returnTo';
import { useAuthReturnTo } from '@/components/auth/useAuthReturnTo';

/** 直接读 window.location.search（dev 下 useSearchParams 可能因路由器未就绪而挂起）。 */
function tokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token');
}

function ResetInner() {
  const t = zhCN.authPages;
  const returnTo = useAuthReturnTo();
  const requestPending = useRef(false);
  const token = tokenFromLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (requestPending.current) return;
    setError(null);
    setFieldError({});
    if (!token) {
      setError(zhCN.auth.linkInvalid);
      return;
    }
    if (!passwordSchema.safeParse(password).success) {
      setFieldError({ password: t.passwordRule });
      return;
    }
    if (password !== confirm) {
      setFieldError({ confirm: t.passwordMismatch });
      return;
    }
    requestPending.current = true;
    setPending(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error?.message || zhCN.auth.linkInvalid);
    } catch {
      setError(t.networkError);
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  };

  if (done) {
    return (
      <AuthShell title={t.resetTitle}>
        <div className="grid gap-4">
          <FormNotice>{t.resetSuccess}</FormNotice>
          <Link href={authPageHref('login', returnTo)} className="text-center text-body-sm font-medium text-accent hover:underline hover:underline-offset-3">
            {t.goLogin}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.resetTitle}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label={t.password} hint={t.passwordRule} error={fieldError.password}>
          <Input type="password" autoComplete="new-password" disabled={pending} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label={t.confirmPassword} error={fieldError.confirm}>
          <Input type="password" autoComplete="new-password" disabled={pending} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.submit}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return <ResetInner />;
}
