'use client';

import { ArrowLeft } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { IconButton } from '@/components/ui/icon-button';
import { SearchField } from '@/components/ui/search-field';
import { ConsentCard } from './consent-card';
import { DefaultMobileTop, MobileTopbarFrame } from './mobile-topbar';
import { rememberSearch } from './recent-searches';
import { searchHref, SearchSuggestions } from './search-suggestions';
import { ShellNavigationProvider, useShellNavigation, type SiteNav } from './shell-context';
import { SiteFooter } from './site-footer';
import { SiteTopbar, type TopbarCta } from './site-topbar';
import { Tabbar } from './tabbar';

export type { SiteNav } from './shell-context';
export type { TopbarCta } from './site-topbar';

export interface SiteShellProps {
  /** 顶栏 / 底栏高亮。 */
  nav?: SiteNav;
  /** 顶栏「上传图片」：primary 主按钮；secondary 页面自带主操作时降为描边；false 不显示（创作页、账号页）。 */
  topbarCta?: TopbarCta;
  /** 手机底栏；二级页（详情、编辑器、账号页）为 false。 */
  tabbar?: boolean;
  /** 桌面页脚。 */
  footer?: boolean;
  /** 手机顶栏：'default' 标志 + 搜索 + 头像 / 登录；'discover' 标志 + 搜索 + 通知；自定义内容；false 不显示。 */
  mobileTop?: 'default' | 'discover' | ReactNode | false;
  /** 顶栏是否显示账号位（账号页自己就是登录表单，为 false）。 */
  account?: boolean;
  /** 统计同意浮卡（编辑器工作区不打扰，为 false）。 */
  consent?: boolean;
  /** 顶栏搜索框的当前关键词（发现页结果视图回填）。 */
  query?: string;
  /** 手机全屏搜索页的附加区块（票 04：按类目看看）。 */
  searchExtras?: ReactNode;
  /** 离开拦截：外壳里的站内跳转都交给它（工作台先保存再走）。 */
  onNavigate?: (href: string) => void;
  children: ReactNode;
}

/**
 * 站点外壳（D66，原型 app.js）：桌面顶栏、手机顶栏、主区域、页脚、手机底栏、统计同意浮卡。
 * 外壳各部分自带 data-ui；主区域不加，页面的新界面根自己加 data-ui。
 */
export function SiteShell({ onNavigate, ...props }: SiteShellProps) {
  return (
    <ShellNavigationProvider onNavigate={onNavigate}>
      <ShellFrame {...props} />
    </ShellNavigationProvider>
  );
}

function ShellFrame({ nav = null, topbarCta = 'primary', tabbar = true, footer = true, mobileTop = 'default', account = true, consent = true, query = '', searchExtras, children }: Omit<SiteShellProps, 'onNavigate'>) {
  const [searching, setSearching] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const openSearch = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearching(true);
    window.scrollTo(0, 0);
  };
  const closeSearch = () => {
    setSearching(false);
    requestAnimationFrame(() => opener.current?.focus());
  };
  return (
    <div className="min-h-dvh bg-bg">
      <SiteTopbar nav={nav} cta={topbarCta} account={account} query={query} />
      {searching ? (
        <MobileSearchTop onClose={closeSearch} onDone={() => setSearching(false)} />
      ) : mobileTop === false ? null : (
        <MobileTopbarFrame>{mobileTop === 'default' || mobileTop === 'discover' ? <DefaultMobileTop variant={mobileTop as 'default' | 'discover'} account={account} onSearch={openSearch} /> : mobileTop}</MobileTopbarFrame>
      )}
      <main id="main" tabIndex={-1} className={cn('min-h-page focus:outline-none', tabbar && 'max-md:pb-tabbar-safe')}>
        {searching ? (
          <section data-ui="" aria-label={zhCN.shell.search.panel} className="page-container md:hidden">
            <SearchSuggestions
              query=""
              layout="page"
              onPick={() => setSearching(false)}
              // 附加区块里的链接（按类目看看）多半跳回同一页面，外壳不会重挂载，点了就收起搜索页。
              extras={searchExtras ? <div className="contents" onClickCapture={(event) => { if ((event.target as HTMLElement).closest('a')) setSearching(false); }}>{searchExtras}</div> : undefined}
            />
          </section>
        ) : null}
        <div className={searching ? 'max-md:hidden' : 'contents'}>{children}</div>
      </main>
      {footer ? <SiteFooter /> : null}
      {tabbar ? <Tabbar nav={nav} /> : null}
      {consent ? <ConsentCard /> : null}
    </div>
  );
}

/** 手机全屏搜索页的顶栏：返回 + 搜索框（原型 #/search），提交后回到发现页结果。 */
function MobileSearchTop({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { navigate } = useShellNavigation();
  const [value, setValue] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    rememberSearch(q);
    onDone();
    navigate(searchHref(q));
  };
  return (
    <MobileTopbarFrame className="gap-1 pl-2">
      <IconButton label={zhCN.shell.back} tooltip={false} onClick={onClose}>
        <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <form action="/" role="search" aria-label={zhCN.shell.search.label} onSubmit={submit} className="mr-1 min-w-0 flex-1" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
        <SearchField
          autoFocus
          name="q"
          value={value}
          onValueChange={setValue}
          placeholder={zhCN.shell.search.label}
          aria-label={zhCN.shell.search.label}
          autoComplete="off"
          enterKeyHint="search"
          wrapperClassName="h-10 pl-3.5"
        />
      </form>
    </MobileTopbarFrame>
  );
}
