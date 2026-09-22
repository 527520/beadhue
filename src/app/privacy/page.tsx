import type { Metadata } from "next";
import SiteHeader from "@/components/layout/SiteHeader";
import { AnalyticsConsentSettings } from "@/components/analytics/AnalyticsConsent";
import { zhCN } from "@/messages/zh-CN";

export const metadata: Metadata = { title: zhCN.communityAdmin.privacyTitle };

export default function PrivacyPage() {
  const t = zhCN.communityAdmin.privacy;
  return (
    <main id="main" className="workspace-page">
      <SiteHeader
        title={t.title}
        hideHeading
        currentPath="/privacy"
        subtitle={t.subtitle}
      />
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
    </main>
  );
}
