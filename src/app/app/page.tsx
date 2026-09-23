'use client';

/** /app 工作台页（T12）：整页为客户端组件组装；站点外壳与 <main id="main"> 由 Workbench 里的 SiteShell 提供。 */
import Workbench from '@/components/workbench/Workbench';

export default function AppPage() {
  return <Workbench />;
}
