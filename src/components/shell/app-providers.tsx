'use client';

import { useEffect, type ReactNode } from 'react';
import { migrateBrowserPreferences } from '@/lib/storage/brandMigration';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { AnalyticsConsentInitialization } from '@/components/analytics/AnalyticsConsent';
import { ToastProvider } from '@/components/ui/toast';
import { LoginDialogProvider } from './login-dialog';

/**
 * 根布局的全站能力：提示（Toast）容器、登录弹窗、已同意统计的恢复、浏览器偏好迁移与原图上传续传。
 * 不包任何样式作用域；站点外壳由各页面的 SiteShell 渲染。
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const auth = useAuthStatus();
  const email = auth.kind === 'user' ? auth.email : null;
  useEffect(() => {
    migrateBrowserPreferences();
    // 续传模块连带本机存储、项目校验与整套色板数据，不能进每页的首屏 JS。
    let resume: (() => void) | null = null;
    let cancelled = false;
    void import('@/lib/originals/client').then(({ resumeOriginalUploads }) => {
      if (cancelled) return;
      resume = () => void resumeOriginalUploads();
      resume();
      window.addEventListener('online', resume);
    });
    return () => {
      cancelled = true;
      if (resume) window.removeEventListener('online', resume);
    };
  }, [email]);
  return (
    <ToastProvider>
      <LoginDialogProvider>
        <AnalyticsConsentInitialization />
        {children}
      </LoginDialogProvider>
    </ToastProvider>
  );
}
