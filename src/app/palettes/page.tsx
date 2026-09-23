import type { Metadata } from 'next';
import PalettesView from '@/components/palettes/PalettesView';
import { SiteShell } from '@/components/shell/site-shell';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.palettes };

/** 色板库（公开，未登录可看）；票 06 按「我的 · 色板」的内置部分重做。 */
export default function PalettesPage() {
  return (
    <SiteShell nav={null}>
      <PalettesView />
    </SiteShell>
  );
}
