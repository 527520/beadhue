'use client';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import { zhCN } from '@/messages/zh-CN';
export default function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main id="main" className="workspace-page"><SiteHeader title={title} currentPath="/account" hideHeading /><div className="container"><section className="form-card beadhue-auth-card"><h1>{title}</h1><p className="muted">{zhCN.authPages.formHint}</p>{children}<Link href="/" className="back">{zhCN.nav.home}</Link></section></div></main>;
}
