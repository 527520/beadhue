'use client';

/** 登录页（spec §F9）：与登录弹窗共用表单；统一错误文案、pending 禁用、成功后跳转回原操作页。 */
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/shell/login-form';
import { zhCN } from '@/messages/zh-CN';
import { loginRedirectTarget } from './loginRedirect';
import { authPageHref, isAdminReturnTo } from '@/lib/auth/returnTo';
import { useAuthReturnTo } from '@/components/auth/useAuthReturnTo';

export default function LoginPage() {
  const router = useRouter();
  const next = useAuthReturnTo('');
  const adminLogin = isAdminReturnTo(next);
  return (
    <AuthShell
      title={adminLogin ? zhCN.authPages.adminLoginTitle : zhCN.shell.loginDialog.title}
      description={adminLogin ? zhCN.authPages.adminLoginIntro : zhCN.shell.loginDialog.intro}
      eyebrow={adminLogin ? zhCN.authPages.adminLoginEyebrow : undefined}
    >
      <LoginForm
        onSuccess={() => router.push(loginRedirectTarget())}
        registerHref={next && !adminLogin ? authPageHref('register', next) : null}
        forgotHref={authPageHref('forgot-password', next)}
        notice={adminLogin ? <p className="text-center text-body-sm text-ink-3">{zhCN.authPages.adminAccountNotice}</p> : null}
      />
    </AuthShell>
  );
}
