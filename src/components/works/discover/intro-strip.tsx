'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { BRAND_BEAD_COLORS } from '@/lib/render/beadTokens';
import { zhCN } from '@/messages/zh-CN';
import { buttonVariants } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

const t = zhCN.discover.intro;
export const INTRO_CLOSED_KEY = 'beadhue:discover-intro-closed';
const CHANGED = 'beadhue:discover-intro-changed';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readVisible(): boolean {
  try {
    return window.localStorage.getItem(INTRO_CLOSED_KEY) !== '1';
  } catch {
    return false;
  }
}

/**
 * 新手条（D69）：首访在网格上方显示一行，可关闭，关闭记在本机。
 * 服务端与水合首帧不渲染（关过的回访者不会看到闪一下）。
 */
export function IntroStrip() {
  const visible = useSyncExternalStore(subscribe, readVisible, () => false);
  if (!visible) return null;
  const close = () => {
    try {
      window.localStorage.setItem(INTRO_CLOSED_KEY, '1');
    } catch {
      // 存储不可用（隐私模式）时只在本次隐藏。
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <aside aria-label={t.label} className="mb-5 flex items-center gap-3 rounded-lg bg-bg-subtle py-2.5 pr-2.5 pl-4 max-md:mb-4 max-md:gap-2.5 max-md:py-2 max-md:pr-1.5 max-md:pl-3">
      <span aria-hidden="true" className="inline-flex gap-0.75">
        {BRAND_BEAD_COLORS.slice(0, 3).map((color) => (
          <i key={color} className="relative size-2.5 rounded-full after:absolute after:inset-0.75 after:rounded-full after:bg-bg/70 after:content-['']" style={{ backgroundColor: color }} />
        ))}
      </span>
      <p className="min-w-0 flex-1 text-body-sm text-ink-2 max-md:text-footnote max-md:leading-5">
        <b className="mr-1 font-semibold text-ink">{t.title}</b>
        <span className="max-md:hidden">{t.desktop}</span>
        <span className="md:hidden">{t.mobile}</span>
      </p>
      <Link href="/app" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'max-md:hidden' })}>{t.howTo}</Link>
      <IconButton size="sm" label={t.close} onClick={close}>
        <X aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
    </aside>
  );
}
