import type { Metadata } from 'next';
import { DesignsPanel } from '@/components/me/designs/designs-panel';
import { readDesignsQuery } from '@/components/me/designs/design-model';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.account.designs };

/** 我的 · 设计：本机与云端合并列表；搜索、状态、排序、视图读自地址。 */
export default async function MeDesignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DesignsPanel initialQuery={readDesignsQuery(await searchParams)} />;
}
