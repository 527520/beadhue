import type { Metadata } from 'next';
import PalettesView from '@/components/palettes/PalettesView';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.palettes };

/** 我的 · 色板（我的色板 + 内置色板）；过渡期与 /palettes 共用旧色板库，票 06 重做。 */
export default function MePalettesPage() {
  return <PalettesView />;
}
