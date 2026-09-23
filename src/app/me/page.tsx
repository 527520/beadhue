import type { Metadata } from 'next';
import DesignsView from '@/components/designs/DesignsView';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.account.designs };

/** 我的 · 设计（本机与云端合并列表）；过渡期沿用旧设计库，票 06 重做。 */
export default function MeDesignsPage() {
  return <DesignsView />;
}
