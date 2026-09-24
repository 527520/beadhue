import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { SiteShell } from '@/components/shell/site-shell';
import { ArticlePage, ArticleSection, ArticleText, articleLink } from '@/components/pages/article';
import { CONTACT_EMAIL } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.communityAdmin.copyrightTitle };

export default function CommunityCopyrightPage() {
  const t = zhCN.communityAdmin.copyright;
  const toc = [
    { id: 'license', title: t.licenseTitle },
    { id: 'complaint', title: t.complaintTitle },
    { id: 'appeal', title: t.appealTitle },
  ];
  return (
    <SiteShell>
      <ArticlePage title={t.title} lead={t.subtitle} toc={toc}>
        <p className="flex gap-3 rounded-lg bg-bg-subtle p-4 text-body-sm text-pretty text-ink-2">
          <Info aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4.5 shrink-0 text-ink-3" />
          <span>{t.warning}</span>
        </p>
        <ArticleSection id="license" title={t.licenseTitle}>
          <ArticleText>{t.licenseBody}</ArticleText>
        </ArticleSection>
        <ArticleSection id="complaint" title={t.complaintTitle}>
          <ArticleText>
            {t.complaintBeforeEmail} <a className={articleLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{t.complaintAfterEmail}
          </ArticleText>
        </ArticleSection>
        <ArticleSection id="appeal" title={t.appealTitle}>
          <ArticleText>{t.appealBody}</ArticleText>
        </ArticleSection>
      </ArticlePage>
    </SiteShell>
  );
}
