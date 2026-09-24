import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { SiteShell } from '@/components/shell/site-shell';
import { ArticlePage, ArticleSection, ArticleText, articleLink } from '@/components/pages/article';
import { APP_VERSION, AUTHOR_GITHUB_URL, AUTHOR_NAME, CONTACT_EMAIL, ISSUES_URL, SOURCE_REPO_URL } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.about.title };

export default function AboutPage() {
  const t = zhCN.about;
  const toc = [
    { id: 'features', title: t.featuresTitle },
    { id: 'privacy', title: t.privacyTitle },
    { id: 'license', title: t.licenseTitle },
    { id: 'author', title: t.authorTitle },
    { id: 'feedback', title: t.feedbackTitle },
  ];
  return (
    <SiteShell>
      <ArticlePage eyebrow={zhCN.workspace.brandVersion(APP_VERSION)} title={`${zhCN.app.name} BeadHue`} lead={t.intro} toc={toc}>
        <ArticleSection id="features" title={t.featuresTitle}>
          <ul className="grid gap-2">
            {t.features.map((feature) => (
              <li key={feature} className="flex gap-3 text-body text-pretty text-ink-2">
                <Check aria-hidden="true" strokeWidth={1.75} className="mt-1 size-4 shrink-0 text-success" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </ArticleSection>
        <ArticleSection id="privacy" title={t.privacyTitle}>
          <ArticleText>{t.privacyBody}</ArticleText>
          <p className="text-body"><Link href="/privacy" className={articleLink}>{t.privacyLink}</Link></p>
        </ArticleSection>
        <ArticleSection id="license" title={t.licenseTitle}>
          <ArticleText>{t.licenseBody}</ArticleText>
          <p className="text-body"><a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer" className={articleLink}>{t.sourceCode}</a></p>
        </ArticleSection>
        <ArticleSection id="author" title={t.authorTitle}>
          <ArticleText>{AUTHOR_NAME}</ArticleText>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-body">
            <a href={AUTHOR_GITHUB_URL} target="_blank" rel="noreferrer" className={articleLink}>{t.authorGithub}</a>
            <a href={`mailto:${CONTACT_EMAIL}`} className={articleLink}>{CONTACT_EMAIL}</a>
          </p>
        </ArticleSection>
        <ArticleSection id="feedback" title={t.feedbackTitle}>
          <ArticleText>{t.feedbackBody}</ArticleText>
          <p className="text-body"><a href={ISSUES_URL} target="_blank" rel="noreferrer" className={articleLink}>{t.feedbackLink}</a></p>
        </ArticleSection>
      </ArticlePage>
    </SiteShell>
  );
}
