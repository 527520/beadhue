import { zhCN } from '@/messages/zh-CN';
import { SiteShell } from '@/components/shell/site-shell';
import { StateLink, StatePage } from '@/components/pages/state-page';

/** 作品详情 notFound()：编号无效、作者撤回公开或已下架，都引导回发现页。 */
export default function WorkNotFound() {
  const t = zhCN.errorPages;
  return (
    <SiteShell nav="discover" topbarCta="secondary" tabbar={false}>
      <StatePage
        kind="lost"
        title={t.workMissingTitle}
        description={t.workMissingBody}
        actions={<><StateLink href="/" primary>{t.backDiscover}</StateLink><StateLink href="/app">{zhCN.pages.errors.goCreate}</StateLink></>}
      />
    </SiteShell>
  );
}
