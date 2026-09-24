'use client';

/**
 * 全局页面错误边界：覆盖根布局之下的所有页面段（后台有自己的 admin/error.tsx）；根布局本身出错由 global-error.tsx 兜底。
 */
import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { zhCN } from '@/messages/zh-CN';
import { SiteShell } from '@/components/shell/site-shell';
import { Button } from '@/components/ui/button';
import { StateLink, StatePage } from '@/components/pages/state-page';
import { reportClientError } from '@/components/pages/report-client-error';

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = zhCN.errorPages;
  useEffect(() => {
    console.error('[page-error]', error);
    reportClientError(error, zhCN.communityAdmin.readError.reportFallback);
  }, [error]);
  return (
    <SiteShell topbarCta="secondary">
      <StatePage
        kind="broken"
        title={t.errorTitle}
        description={t.errorBody}
        actions={<><Button variant="primary" onClick={() => retry()}><RotateCw aria-hidden="true" strokeWidth={1.75} />{t.retry}</Button><StateLink href="/">{t.backHome}</StateLink></>}
        footnote={error.digest ? zhCN.pages.errors.digest(error.digest) : undefined}
      />
    </SiteShell>
  );
}
