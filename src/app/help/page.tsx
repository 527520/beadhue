import { zhCN } from "@/messages/zh-CN";
import SiteHeader from "@/components/layout/SiteHeader";

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
    <main id="main" className="workspace-page">
      <SiteHeader
        title={zhCN.beadhue.helpTitle}
        subtitle={zhCN.beadhue.helpSubtitle}
        currentPath="/help"
      />
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
    </main>
  );
}
