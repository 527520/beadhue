'use client';

/** 重置密码页（spec §F9、边界 E32）：打开时先预检令牌（不消耗），无效直接给重新获取入口；令牌一次性，成功后提示旧会话失效。 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import FormError from '@/components/auth/FormError';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { zhCN } from '@/messages/zh-CN';
import { passwordSchema } from '@/lib/schemas';
import { authPageHref } from '@/lib/auth/returnTo';
import { useAuthReturnTo } from '@/components/auth/useAuthReturnTo';

type State = 'checking' | 'ready' | 'invalid' | 'done';

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
  // 服务端与水合首帧一致：地址在服务端不可读，预检在水合后的副作用里做。
  const [state, setState] = useState<State>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: State) => { if (!cancelled) setState(next); };
    if (!token) {
      queueMicrotask(() => settle('invalid'));
      return () => { cancelled = true; };
    }
    // 只有明确的 400 才判无效；限流或网络异常照常给表单，提交时再由服务端判断。
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((response) => settle(response.status === 400 ? 'invalid' : 'ready'), () => settle('ready'));
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (requestPending.current || !token) return;
    setError(null);
    setFieldError({});
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
        setState('done');
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

  if (state === 'done') {
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

  if (state === 'checking') {
    return (
      <AuthShell title={t.resetTitle}>
        <p role="status" className="text-center text-body-sm text-ink-3">{t.resetChecking}</p>
      </AuthShell>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthShell title={t.resetTitle}>
        <div className="grid gap-4">
          <FormError message={t.resetInvalid} />
          <Link href={authPageHref('forgot-password', returnTo)} className={buttonVariants({ variant: 'primary', size: 'lg', block: true })}>{t.resetAgain}</Link>
          <Link href={authPageHref('login', returnTo)} className="text-center text-body-sm font-medium text-accent hover:underline hover:underline-offset-3">
            {t.backToLogin}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.resetTitle} description={t.resetHint}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label={t.password} hint={t.passwordRule} error={fieldError.password}>
          <Input type="password" autoComplete="new-password" disabled={pending} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label={t.confirmPassword} error={fieldError.confirm}>
          <Input type="password" autoComplete="new-password" disabled={pending} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.resetSubmit}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return <ResetInner />;
}
