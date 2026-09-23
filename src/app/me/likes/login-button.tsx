'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zhCN } from '@/messages/zh-CN';
import { Button, buttonVariants } from '@/components/ui/button';
import { useLoginDialog } from '@/components/shell/login-dialog';

/** 登录后留在本页并刷新服务端内容。 */
export function LoginButton() {
  const login = useLoginDialog();
  const router = useRouter();
  return <Button variant="primary" onClick={() => login?.open({ onSuccess: () => router.refresh() })}>{zhCN.shell.login}</Button>;
}

export function GoDiscoverLink() {
  return <Link href="/" className={buttonVariants({ variant: 'secondary' })}>{zhCN.shell.mePages.goDiscover}</Link>;
}
