import { zhCN } from "@/messages/zh-CN";
import { SiteShell } from '@/components/shell/site-shell';
import LegacyScope from '@/components/layout/LegacyScope';
import LegacyPageHeading from '@/components/layout/LegacyPageHeading';

export default function HelpPage() {
  const t = zhCN.help;
  const guides = [
    [zhCN.beadhue.helpReuseQuestion, zhCN.beadhue.helpReuseAnswer],
    [zhCN.beadhue.helpReferenceQuestion, zhCN.beadhue.helpReferenceAnswer],
    [zhCN.beadhue.helpPrivateQuestion, zhCN.beadhue.helpPrivateAnswer],
    [zhCN.beadhue.helpQueueQuestion, zhCN.beadhue.helpQueueAnswer],
    [t.uploadTitle, t.uploadBody],
    [t.paramsTitle, t.paramsBody],
    [t.paletteTitle, t.paletteBody],
    [t.seamTitle, t.seamBody],
    [t.exportTitle, t.exportBody],
    ...t.faqs.map((faq) => [faq.q, faq.a]),
  ];
  return (
    <SiteShell nav={null}><LegacyScope><div className="workspace-page">
      <LegacyPageHeading title={zhCN.beadhue.helpTitle} subtitle={zhCN.beadhue.helpSubtitle} />
      <div className="container">
        <div className="help-list">
          {guides.map(([title, body], index) => (
            <details key={title} open={index === 0}>
              <summary>{title}</summary>
              <p>{body}</p>
            </details>
          ))}
        </div>
      </div>
    </div></LegacyScope></SiteShell>
  );
}
