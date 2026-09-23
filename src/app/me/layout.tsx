import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { MeShell } from './me-shell';

export const metadata: Metadata = { title: { default: zhCN.shell.mePages.title, template: `%s - ${zhCN.app.name}` }, robots: { index: false, follow: false } };

export default function MeLayout({ children }: { children: ReactNode }) {
  return <MeShell>{children}</MeShell>;
}
