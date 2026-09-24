'use client';

import type { ReactNode } from 'react';
import { SiteShell } from '@/components/shell/site-shell';

/**
 * 账号页（登录、注册、找回 / 重置密码、邮箱验证）：站点外壳 + 居中卡片，与登录弹窗同一视觉。
 * 账号页自己就是表单：顶栏不放账号位与「上传图片」，手机不显示底栏。
 */
export default function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <SiteShell nav={null} topbarCta={false} account={false} tabbar={false}>
      <div data-ui="" className="min-h-page bg-bg-subtle px-gutter pt-16 pb-12 max-md:bg-bg max-md:pt-6">
        <section aria-labelledby="auth-title" className="mx-auto w-full max-w-dialog-sm rounded-xl bg-bg p-8 shadow-float ring-1 ring-line max-md:p-0 max-md:shadow-none max-md:ring-0">
          <h1 id="auth-title" className="text-title-2 text-ink">{title}</h1>
          {description ? <p className="mt-2 text-body-sm text-ink-3">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </SiteShell>
  );
}
