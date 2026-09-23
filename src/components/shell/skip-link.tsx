'use client';

import { zhCN } from '@/messages/zh-CN';

/**
 * 跳到主内容：聚焦主区域（#main），不触发路由（普通片段链接，Next 不接管）。
 * 地址栏仍会带上 #main，无脚本时照样可用。
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      data-ui=""
      onClick={() => {
        const main = document.getElementById('main');
        if (!main) return;
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus();
      }}
      className="fixed -top-16 left-3 z-100 rounded-full bg-ink px-4 py-2.5 text-body-sm leading-none font-semibold text-on-ink transition-[top] duration-state ease-standard focus-visible:top-3 focus-visible:focus-ring"
    >
      {zhCN.shell.skipToMain}
    </a>
  );
}
