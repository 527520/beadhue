import type { Metadata } from 'next';
import { PalettesPanel } from '@/components/me/palettes/palettes-panel';
import { SiteShell } from '@/components/shell/site-shell';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.palettes };

/** 色板库（公开，未登录可看）：版式同「我的 · 色板」的内置部分；工作台「查看完整色板库」带 ?designId= 进来可直接用于那张图纸。 */
export default function PalettesPage() {
  return (
    <SiteShell nav={null}>
      <div data-ui="" className="page-container pt-8 pb-8 max-md:pt-5">
        <h1 className="mb-6 text-title-1 text-ink max-md:mb-4">{zhCN.me.palettes.title}</h1>
        <PalettesPanel mode="public" />
      </div>
    </SiteShell>
  );
}
