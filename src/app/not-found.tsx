import { zhCN } from '@/messages/zh-CN';
import { SiteShell } from '@/components/shell/site-shell';
import { StateLink, StatePage } from '@/components/pages/state-page';

/** 404：未匹配的路由与各页 notFound() 的兜底（有专属 not-found 的段除外）。 */
export default function NotFound() {
  const t = zhCN.errorPages;
  return (
    <SiteShell topbarCta="secondary">
      <StatePage
        kind="lost"
        title={t.notFoundTitle}
        description={t.notFoundBody}
        actions={<><StateLink href="/" primary>{t.backHome}</StateLink><StateLink href="/app">{zhCN.pages.errors.goCreate}</StateLink></>}
      />
    </SiteShell>
  );
}
