import type { Metadata } from 'next';
import { PalettesPanel } from '@/components/me/palettes/palettes-panel';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.palettes };

/** 我的 · 色板：我的色板 + 内置色板。 */
export default function MePalettesPage() {
  return <PalettesPanel />;
}
