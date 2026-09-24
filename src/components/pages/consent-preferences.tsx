'use client';

import { chooseAnalyticsConsent, useAnalyticsPreference } from '@/components/analytics/AnalyticsConsent';
import { Button } from '@/components/ui/button';
import { zhCN } from '@/messages/zh-CN';

const t = zhCN.communityAdmin.analytics;
const recovery = zhCN.communityAdmin.consentRecovery;

/** 隐私政策页的匿名统计偏好：状态一行 + 同意 / 拒绝（已同意时为撤回），与站点同意浮卡共用同一份偏好。 */
export function ConsentPreferences() {
  const { preference, ready, saving, message, error } = useAnalyticsPreference();
  const pending = preference === 'withdrawn';
  const status = preference === 'granted' ? t.granted : pending ? recovery.pending : preference === 'denied' ? t.denied : t.unset;
  return (
    <div className="grid gap-4 rounded-lg border border-line p-5">
      <p className="text-body text-ink-2">{ready ? t.currentStatus(status) : t.loading}</p>
      {pending && !message ? <p className="text-body-sm text-ink-3">{recovery.stopped}</p> : null}
      <div className="flex flex-wrap gap-2">
        {preference === 'granted' || pending ? (
          <>
            {preference === 'granted' && error ? <Button variant="outline" disabled={saving} onClick={() => void chooseAnalyticsConsent('granted')}>{t.grant}</Button> : null}
            <Button variant="danger-outline" disabled={!ready || saving} onClick={() => void chooseAnalyticsConsent('withdrawn')}>{pending ? recovery.retry : t.withdraw}</Button>
          </>
        ) : (
          <>
            <Button variant="outline" disabled={!ready || saving || preference === 'denied'} onClick={() => void chooseAnalyticsConsent('denied')}>{t.reject}</Button>
            <Button variant="outline" disabled={!ready || saving} onClick={() => void chooseAnalyticsConsent('granted')}>{t.grant}</Button>
          </>
        )}
      </div>
      {message ? <p role={error ? 'alert' : 'status'} className={error ? 'text-body-sm text-danger' : 'text-body-sm text-success'}>{message}</p> : null}
    </div>
  );
}
