import type { Metadata } from "next";
import { SiteShell } from '@/components/shell/site-shell';
import LegacyScope from '@/components/layout/LegacyScope';
import { AnalyticsConsentSettings } from "@/components/analytics/AnalyticsConsent";
import { zhCN } from "@/messages/zh-CN";

export const metadata: Metadata = { title: zhCN.communityAdmin.privacyTitle };

export default function PrivacyPage() {
  const t = zhCN.communityAdmin.privacy;
  return (
    <SiteShell nav={null}><LegacyScope><div className="workspace-page">
      
      <div className="container">
        <div className="form-card beadhue-info-card">
          <section>
            <div>
              <span className="studio-eyebrow">{t.eyebrow}</span>
              <h1>{t.heroTitle}</h1>
              <p>{t.heroBody}</p>
            </div>
          </section>
          <section
            className="community-narrow prose-policy"
            aria-label={t.title}
          >
            {t.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </section>
            ))}
          </section>
          <section
            className="community-narrow"
            aria-label={t.analyticsSettingsTitle}
          >
            <h2 className="prose-policy-heading">{t.analyticsSettingsTitle}</h2>
            <AnalyticsConsentSettings />
          </section>
        </div>
      </div>
    </div></LegacyScope></SiteShell>
  );
}
