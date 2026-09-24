import { zhCN } from '@/messages/zh-CN';
import { SiteShell } from '@/components/shell/site-shell';
import { StateLink, StatePage } from '@/components/pages/state-page';

/** 令牌不存在、已撤销或快照无法读取（D38）。 */
export default function ShareGone() {
  const t = zhCN.pages.share;
  return (
    <SiteShell topbarCta="secondary">
      <StatePage
        kind="lost"
        title={t.goneTitle}
        description={t.goneBody}
        actions={<><StateLink href="/" primary>{t.discover}</StateLink><StateLink href="/app">{zhCN.pages.errors.goCreate}</StateLink></>}
      />
    </SiteShell>
  );
}
