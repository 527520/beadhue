import type { Metadata } from 'next';
import { SiteShell } from '@/components/shell/site-shell';
import { ArticlePage, ArticleSection, ArticleText } from '@/components/pages/article';
import { ConsentPreferences } from '@/components/pages/consent-preferences';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.communityAdmin.privacyTitle };

export default function PrivacyPage() {
  const t = zhCN.communityAdmin.privacy;
  const sections = t.sections.map((section, index) => ({ id: `section-${index + 1}`, ...section }));
  const toc = [...sections, { id: 'analytics', title: t.analyticsSettingsTitle }];
  return (
    <SiteShell>
      <ArticlePage eyebrow={t.eyebrow} title={t.heroTitle} lead={t.heroBody} toc={toc}>
        {sections.map((section) => (
          <ArticleSection key={section.id} id={section.id} title={section.title}>
            <ArticleText>{section.body}</ArticleText>
          </ArticleSection>
        ))}
        <ArticleSection id="analytics" title={t.analyticsSettingsTitle}>
          <ConsentPreferences />
        </ArticleSection>
      </ArticlePage>
    </SiteShell>
  );
}
