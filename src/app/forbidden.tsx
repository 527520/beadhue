import { zhCN } from '@/messages/zh-CN';
import { SiteShell } from '@/components/shell/site-shell';
import { StateLink, StatePage } from '@/components/pages/state-page';

/** 403：已登录但无权访问的管理资源（forbidden()）。 */
export default function ForbiddenPage() {
  const t = zhCN.communityAdmin.forbidden;
  return (
    <SiteShell topbarCta="secondary" tabbar={false}>
      <StatePage kind="broken" title={t.title} description={t.body} footnote={t.eyebrow} actions={<StateLink href="/" primary>{t.backHome}</StateLink>} />
    </SiteShell>
  );
}
