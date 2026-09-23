import type { Metadata } from 'next';
import { SiteShell } from '@/components/shell/site-shell';
import LegacyScope from '@/components/layout/LegacyScope';
import LegacyPageHeading from '@/components/layout/LegacyPageHeading';
import { CONTACT_EMAIL } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.communityAdmin.copyrightTitle };
export default function CommunityCopyrightPage() {
  const t = zhCN.communityAdmin.copyright;
  return <SiteShell nav={null}><LegacyScope><div className="workspace-page"><LegacyPageHeading title={t.title} subtitle={t.subtitle} /><div className="workspace-content community-narrow prose-policy"><p className="admin-help">{t.warning}</p><h2>{t.licenseTitle}</h2><p>{t.licenseBody}</p><h2>{t.complaintTitle}</h2><p>{t.complaintBeforeEmail} <a className="link-soft" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{t.complaintAfterEmail}</p><h2>{t.appealTitle}</h2><p>{t.appealBody}</p></div></div></LegacyScope></SiteShell>;
}
