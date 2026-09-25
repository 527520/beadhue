'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { authPageHref } from '@/lib/auth/returnTo';
import { ensureAuthStatus } from '@/components/account/useAuthStatus';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { LoginForm } from './login-form';

const t = zhCN.shell.loginDialog;

export interface LoginRequest {
  /** 登录成功后继续原操作（点赞、下载、举报、评论、公开…）。 */
  onSuccess?: () => void;
}

interface LoginDialogApi {
  open: (request?: LoginRequest) => void;
}

const LoginDialogContext = createContext<LoginDialogApi | null>(null);

/** 站内登录弹窗（手机为底部面板）：根布局挂一次，任何需要登录的操作都用它，登录后留在原页面。 */
export function LoginDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const request = useRef<LoginRequest>({});
  const toast = useToast();
  const pathname = usePathname() ?? '/';
  const openDialog = useCallback((next: LoginRequest = {}) => {
    request.current = next;
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ open: openDialog }), [openDialog]);
  const here = typeof window === 'undefined' ? pathname : `${window.location.pathname}${window.location.search}`;
  return (
    <LoginDialogContext value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <DialogDescription className="text-ink-3">{t.intro}</DialogDescription>
            <LoginForm
              autoFocus
              blockUnverified
              registerHref={authPageHref('register', here)}
              forgotHref={authPageHref('forgot-password', here)}
              onSuccess={() => {
                setOpen(false);
                toast(t.success);
                const action = request.current.onSuccess;
                request.current = {};
                action?.();
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </LoginDialogContext>
  );
}

/** 没有 Provider（单元测试里单独渲染组件）时返回 null，调用方退回普通登录链接。 */
export function useLoginDialog(): LoginDialogApi | null {
  return useContext(LoginDialogContext);
}

/** 需要登录的操作：已登录直接执行；否则弹出登录，成功后继续原操作。 */
export function useRequireLogin(): (action: () => void) => void {
  const login = useLoginDialog();
  return useCallback((action: () => void) => {
    void ensureAuthStatus().then((status) => {
      if (status.kind === 'user') action();
      else if (login) login.open({ onSuccess: action });
      else window.location.assign(authPageHref('login', `${window.location.pathname}${window.location.search}`));
    });
  }, [login]);
}

/**
 * 登录链接（「登录后继续」入口）：普通点击改为弹出登录弹窗，登录后刷新当前页（服务端按新登录态重渲染）；
 * 中键 / 新标签与没有 Provider 时仍走 /login?next=。
 */
export function useLoginLinkClick(): (event: MouseEvent<HTMLAnchorElement>) => void {
  const login = useLoginDialog();
  const router = useRouter();
  return useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (!login || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    login.open({ onSuccess: () => router.refresh() });
  }, [login, router]);
}

export function LoginLink(props: ComponentProps<typeof Link>) {
  const onClick = useLoginLinkClick();
  return <Link {...props} onClick={onClick} />;
}
