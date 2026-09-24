'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { MobileTopBack } from '@/components/shell/mobile-topbar';
import { MoreMenu, ShareMenu, type ShareWork } from './work-actions';

/** 手机顶栏（原型 detail mobileTop）：返回、作品名（标题滚出视野后淡入）、分享、更多。 */
export function DetailMobileTop({ work, backHref }: { work: ShareWork; backHref: string }) {
  const [titleShown, setTitleShown] = useState(false);
  useEffect(() => {
    const heading = document.getElementById('work-title');
    if (!heading || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setTitleShown(!entry.isIntersecting && entry.boundingClientRect.top < 64);
    }, { rootMargin: '-56px 0px 0px 0px' });
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <MobileTopBack href={backHref} label={zhCN.detail.backToDiscover} />
      <span aria-hidden="true" className={cn('min-w-0 flex-1 truncate pl-8 text-center text-title-3 text-ink transition-opacity duration-state ease-standard', titleShown ? 'opacity-100' : 'opacity-0')}>
        {work.title}
      </span>
      <ShareMenu work={work} />
      <MoreMenu work={work} withCopy />
    </>
  );
}
