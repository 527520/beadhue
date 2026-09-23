import type { Metadata } from 'next';
import { SiteShell } from '@/components/shell/site-shell';
import LegacyScope from '@/components/layout/LegacyScope';
import LegacyPageHeading from '@/components/layout/LegacyPageHeading';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.communityAdmin.rulesTitle };
export default function CommunityRulesPage() {
  const t = zhCN.communityAdmin.rulesPage;
  return <SiteShell nav={null}><LegacyScope><div className="workspace-page"><LegacyPageHeading title={t.title} subtitle={t.subtitle} /><div className="workspace-content community-narrow prose-policy"><h2>{t.safeTitle}</h2><p>{t.safeBody}</p><h2>{t.reviewTitle}</h2><p>{t.reviewBody}</p><h2>{t.controlTitle}</h2><p>{t.controlBody}</p><h2>{t.scopeTitle}</h2><p>{t.scopeBody}</p></div></div></LegacyScope></SiteShell>;
}
