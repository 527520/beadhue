'use client';

import SiteFooter from '@/components/layout/SiteFooter';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { migrateBrowserPreferences } from '@/lib/storage/brandMigration';
import { resumeOriginalUploads } from '@/lib/originals/client';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { AnalyticsConsentBanner, AnalyticsConsentInitialization } from './AnalyticsConsent';

const Placement = createContext<(node: HTMLDivElement | null) => void>(() => {});

/** Keep consent initialization mounted once while the page shell chooses its position. */
export function ConsentPlacement({ children }: { children: ReactNode }) {
  const auth = useAuthStatus();
  const email = auth.kind === 'user' ? auth.email : null;
  useEffect(() => { migrateBrowserPreferences(); void resumeOriginalUploads(); window.addEventListener('online',resumeOriginalUploads); return () => window.removeEventListener('online',resumeOriginalUploads); }, [email]);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();
  // 管理后台是工作人员的工作区，不在每页底部反复弹统计同意；同意仍可在前台任意页面或账号页处理。
  const suppressed = pathname?.startsWith('/admin') ?? false;
  return <Placement value={setSlot}><AnalyticsConsentInitialization />{suppressed ? children : <div className="beadhue-ui" data-theme="candy">{children}{pathname !== '/app' && <div className="container"><SiteFooter /></div>}</div>}{!suppressed && <AnalyticsConsentBanner target={slot} />}</Placement>;
}

export function ConsentSlot() {
  const setSlot = useContext(Placement);
  return <div className="consent-slot" ref={setSlot} />;
}
