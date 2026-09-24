import type { Metadata } from 'next';
import { SiteShell } from '@/components/shell/site-shell';
import { ArticlePage, ArticleSection, ArticleText } from '@/components/pages/article';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.communityAdmin.rulesTitle };

export default function CommunityRulesPage() {
  const t = zhCN.communityAdmin.rulesPage;
  const sections = [
    { id: 'publish', title: t.safeTitle, body: t.safeBody },
    { id: 'review', title: t.reviewTitle, body: t.reviewBody },
    { id: 'rights', title: t.controlTitle, body: t.controlBody },
    { id: 'reports', title: t.scopeTitle, body: t.scopeBody },
  ];
  return (
    <SiteShell>
      <ArticlePage title={t.title} lead={t.subtitle} toc={sections}>
        {sections.map((section) => (
          <ArticleSection key={section.id} id={section.id} title={section.title}>
            <ArticleText>{section.body}</ArticleText>
          </ArticleSection>
        ))}
      </ArticlePage>
    </SiteShell>
  );
}
