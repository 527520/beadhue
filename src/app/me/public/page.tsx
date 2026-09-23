import type { Metadata } from 'next';
import CommunityMineView from '@/components/community/CommunityMineView';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.publicTitle };

/** 我的 · 公开作品（原 /community/mine）；票 06 重做。 */
export default function MePublicPage() {
  return <CommunityMineView />;
}
