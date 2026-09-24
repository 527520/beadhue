import type { Metadata } from 'next';
import { SettingsView } from '@/components/me/settings/settings-view';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.shell.mePages.settings };

/** 账号设置（原 /account）：个人资料、登录与安全、原图空间、隐私、危险区域。 */
export default function MeSettingsPage() {
  return <SettingsView />;
}
