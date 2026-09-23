'use client';

import { useEffect, type ReactNode } from 'react';
import { migrateBrowserPreferences } from '@/lib/storage/brandMigration';
import { resumeOriginalUploads } from '@/lib/originals/client';
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
    void resumeOriginalUploads();
    window.addEventListener('online', resumeOriginalUploads);
    return () => window.removeEventListener('online', resumeOriginalUploads);
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
