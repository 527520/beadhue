import type { Metadata } from 'next';
import AccountSettingsView from '@/components/account/AccountSettingsView';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.settings };

/** 账号设置（原 /account）；票 06 重做。 */
export default function MeSettingsPage() {
  return <AccountSettingsView />;
}
