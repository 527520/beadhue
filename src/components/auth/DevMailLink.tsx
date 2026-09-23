import { zhCN } from '@/messages/zh-CN';

/** 开发邮件模式：服务端把验证 / 重置链接放在响应头里，直接展示（正式环境不出现）。 */
export default function DevMailLink({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <div className="rounded-md bg-info-soft p-3 text-body-sm">
      <p className="mb-2 text-ink">{zhCN.authPages.devMailHint}</p>
      <a href={href} className="break-all text-accent underline underline-offset-2">{href}</a>
    </div>
  );
}
