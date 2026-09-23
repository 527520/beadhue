'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import LegacyScope from '@/components/layout/LegacyScope';
import LegacyPageHeading from '@/components/layout/LegacyPageHeading';
import AccountMenu from '@/components/account/AccountMenu';
import Icon from '@/components/legacy-ui/Icon';
import OriginalStorageUsage from '@/components/beadhue/OriginalStorageUsage';
import { createBeadhueApi, type MeInfo } from '@/lib/sync/api';
import { zhCN } from '@/messages/zh-CN';
import { notifyAuthStatusChanged } from '@/components/account/useAuthStatus';
import Link from 'next/link';

/** 账号设置（旧界面内容，/me/settings 过渡期使用；票 06 重做）。 */
export default function AccountSettingsView() {
  const api = useMemo(() => createBeadhueApi(), []);
  const [me, setMe] = useState<MeInfo | 'loading'>('loading');
  const [error, setError] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(false);
    try {
      setMe(await api.me());
    } catch {
      setError(true);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const cloudReady = me !== 'loading' && me.state === 'verified';

  return (
    <LegacyScope><div className="workspace-page">
      <LegacyPageHeading title={zhCN.workspace.account} subtitle={zhCN.workspace.accountSubtitle} />
      <div className="container"><div className="form-card account-card">
        {error ? <div role="alert" className="notice notice-danger"><p>{zhCN.account.readFailed}</p><button type="button" className="button" onClick={() => void load()}>{zhCN.common.retry}</button></div> : <AccountMenu api={api} me={me} onAuthChanged={() => { notifyAuthStatusChanged(); void load(); }} />}
        <OriginalStorageUsage key={me === 'loading' ? 'loading' : me.state} account />
        <p className="note">{zhCN.beadhue.storageHint}</p>
        <div className="status-list">
          <p><Icon name={cloudReady ? 'check' : 'folder'} />{error || me === 'loading' ? zhCN.account.noSyncClaim : cloudReady ? zhCN.beadhue.privateSyncHint : zhCN.account.localModeHint}</p>
          <p><Icon name="lock" />{zhCN.beadhue.withdrawHint}</p>
          <p><Icon name="clock" />{zhCN.beadhue.queueHint}</p>
        </div>
        <div className="row wrap"><Link href="/me" className="button">{zhCN.beadhue.manageDesigns}</Link><Link href="/privacy" className="button quiet">{zhCN.account.analyticsPreferences}</Link></div>
      </div></div>
    </div></LegacyScope>
  );
}
