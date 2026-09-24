import { zhCN } from '@/messages/zh-CN';
import { EmptyState } from '@/components/ui/empty-state';
import { MobileTopBack, MobileTopSpacer, MobileTopTitle } from '@/components/shell/mobile-topbar';
import { SiteShell } from '@/components/shell/site-shell';
import { DiscoverLink } from './author-view';

const t = zhCN.detail.author;

/** 不存在的作者（原型 renderAuthor 的空状态）。 */
export default function AuthorNotFound() {
  return (
    <SiteShell nav={null} topbarCta="secondary" mobileTop={<><MobileTopBack /><MobileTopTitle>{t.fallbackTitle}</MobileTopTitle><MobileTopSpacer /></>}>
      <div data-ui="" className="page-container pb-8">
        <EmptyState
          kind="search"
          title={t.notFound}
          description={t.notFoundHint}
          actions={<DiscoverLink />}
        />
      </div>
    </SiteShell>
  );
}
