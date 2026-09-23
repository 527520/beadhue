'use client';

import { zhCN } from '@/messages/zh-CN';
import { chooseAnalyticsConsent, useAnalyticsPreference } from '@/components/analytics/AnalyticsConsent';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const t = zhCN.shell.consent;
const recovery = zhCN.communityAdmin.consentRecovery;

/**
 * 统计同意浮卡（D69）：左下角（手机在底栏上方），不占页面流；两个按钮同为次按钮。
 * 逻辑与接口沿用 AnalyticsConsent（Cookie + PUT /api/analytics/consent）。
 */
export function ConsentCard() {
  const { preference, ready, saving, message, error } = useAnalyticsPreference();
  const toast = useToast();
  if (!ready || (preference === 'granted' && !error) || preference === 'denied') return null;
  const pending = preference === 'withdrawn';
  const choose = async (status: 'granted' | 'denied' | 'withdrawn') => {
    if (await chooseAnalyticsConsent(status)) toast(t.saved);
  };
  return (
    <aside
      data-ui=""
      aria-label={t.label}
      className="fixed bottom-6 left-6 z-50 w-90 animate-toast-in rounded-lg bg-bg p-4 shadow-dialog ring-1 ring-line max-md:right-3 max-md:bottom-above-tabbar max-md:left-3 max-md:w-auto"
    >
      <h2 className="text-body-sm leading-5 font-semibold text-ink">{pending ? recovery.stoppedTitle : t.title}</h2>
      <p className="mt-1 text-footnote leading-5 text-ink-3">{pending ? recovery.stopped : t.body}</p>
      {error && message ? <p role="alert" className="mt-2 text-footnote text-danger">{message}</p> : null}
      <div className="mt-3 flex gap-2 [&>*]:flex-1">
        {pending ? (
          <Button size="sm" disabled={saving} onClick={() => void choose('withdrawn')}>{recovery.retry}</Button>
        ) : (
          <>
            <Button size="sm" disabled={saving} onClick={() => void choose('denied')}>{t.reject}</Button>
            <Button size="sm" disabled={saving} onClick={() => void choose('granted')}>{t.grant}</Button>
          </>
        )}
      </div>
    </aside>
  );
}
