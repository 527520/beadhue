import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { SiteShell } from '@/components/shell/site-shell';
import { ArticlePage, ArticleSection, ArticleText } from '@/components/pages/article';
import { HelpSteps } from '@/components/pages/help-steps';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.help.title };

export default function HelpPage() {
  const t = zhCN.help;
  const b = zhCN.beadhue;
  const guides = [
    [b.helpReuseQuestion, b.helpReuseAnswer],
    [b.helpReferenceQuestion, b.helpReferenceAnswer],
    [b.helpPrivateQuestion, b.helpPrivateAnswer],
    [b.helpQueueQuestion, b.helpQueueAnswer],
    [t.uploadTitle, t.uploadBody],
    [t.paramsTitle, t.paramsBody],
    [t.paletteTitle, t.paletteBody],
    [t.seamTitle, t.seamBody],
    [t.exportTitle, t.exportBody],
  ].map(([title, body], index) => ({ id: `guide-${index + 1}`, title, body }));
  const toc = [
    { id: 'steps', title: zhCN.pages.help.stepsTitle },
    ...guides,
    { id: 'faq', title: t.faqTitle },
  ];
  return (
    // 「开始制作」是本页唯一主按钮，顶栏上传降为描边。
    <SiteShell topbarCta="secondary">
      <ArticlePage title={b.helpTitle} lead={b.helpSubtitle} toc={toc}>
        <ArticleSection id="steps" title={zhCN.pages.help.stepsTitle}>
          <ArticleText className="text-ink-3">{zhCN.pages.help.stepsLead}</ArticleText>
          <HelpSteps />
        </ArticleSection>
        {guides.map((guide) => (
          <ArticleSection key={guide.id} id={guide.id} title={guide.title}>
            <ArticleText>{guide.body}</ArticleText>
          </ArticleSection>
        ))}
        <ArticleSection id="faq" title={t.faqTitle}>
          <div className="border-t border-line">
            {t.faqs.map((faq) => (
              <details key={faq.q} className="group border-b border-line">
                <summary className="flex min-h-control-lg cursor-pointer list-none items-center gap-3 py-3 text-body font-semibold text-ink focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 text-balance">{faq.q}</span>
                  <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4.5 shrink-0 text-ink-3 transition-transform duration-state group-open:rotate-180" />
                </summary>
                <p className="pb-4 text-body text-pretty text-ink-2">{faq.a}</p>
              </details>
            ))}
          </div>
        </ArticleSection>
      </ArticlePage>
    </SiteShell>
  );
}
