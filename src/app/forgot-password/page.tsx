'use client';

/** 找回密码页（spec §F9 防枚举）：恒成功提示 + 60s 冷却。 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import DevMailLink from '@/components/auth/DevMailLink';
import { Button } from '@/components/ui/button';
import { Field, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { zhCN } from '@/messages/zh-CN';
import { emailSchema } from '@/lib/schemas';
import { DEV_MAIL_LINK_HEADER } from '@/lib/auth/mailMeta';
import { authPageHref } from '@/lib/auth/returnTo';
import { useAuthReturnTo } from '@/components/auth/useAuthReturnTo';

export default function ForgotPasswordPage() {
  const t = zhCN.authPages;
  const returnTo = useAuthReturnTo();
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [devMailLink, setDevMailLink] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!emailSchema.safeParse(email).success) {
      setError(t.emailInvalid);
      return;
    }
    if (cooldown > 0 || requestPending.current) return;
    requestPending.current = true;
    setPending(true);
    try {
      // 恒成功语义（防枚举，spec E28/E33）：无论邮箱是否存在均返回 204
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // 开发邮件模式：账号存在时服务端把重置链接放在响应头里（正式环境恒为 null）
      setDevMailLink(res.headers.get(DEV_MAIL_LINK_HEADER));
    } catch {
      // 网络失败同样按恒成功提示，避免泄露是否存在账号
    } finally {
      requestPending.current = false;
      setPending(false);
    }
    setDone(true);
    setCooldown(60);
  };

  return (
    <AuthShell title={t.forgotTitle} description={t.forgotHint}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {done && (
          <>
            <FormNotice>{t.forgotSent}</FormNotice>
            <DevMailLink href={devMailLink} />
          </>
        )}
        <Field label={t.email} error={error}>
          <Input type="email" autoComplete="email" disabled={pending} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" size="lg" block disabled={cooldown > 0} loading={pending}>
          {cooldown > 0 ? t.cooldown(cooldown) : t.forgotSubmit}
        </Button>
        <p className="text-center text-body-sm">
          <Link href={authPageHref('login', returnTo)} className="font-medium text-accent hover:underline hover:underline-offset-3">
            {t.backToLogin}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
