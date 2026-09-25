'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';
import { Kbd } from '@/components/ui/kbd';
import { SearchField } from '@/components/ui/search-field';
import { rememberSearch } from './recent-searches';
import { searchHref, SearchSuggestions } from './search-suggestions';
import { useShellNavigation } from './shell-context';

const t = zhCN.shell.search;
/** 建议面板宽度取 max(搜索框宽, 440)，离视口边缘至少 12。 */
const PANEL_MIN_WIDTH = 440;
const VIEWPORT_MARGIN = 12;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * 桌面顶栏的胶囊搜索：聚焦展开建议面板（最近搜索、大家在搜；输入后为匹配的图纸与作者），
 * 回车进入 /?q=，「/」快捷键聚焦。面板跟在输入框后面渲染（不走 portal），Tab 可以直接进入建议项。
 */
export function SearchBox({ query = '', className }: { query?: string; className?: string }) {
  const { navigate } = useShellNavigation();
  const [value, setValue] = useState(query);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  const openPanel = useCallback(() => {
    const form = formRef.current;
    if (form) {
      const rect = form.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), viewport - VIEWPORT_MARGIN * 2);
      const overflow = rect.left + width - (viewport - VIEWPORT_MARGIN);
      setPanelStyle({ width, left: overflow > 0 ? -overflow : 0 });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const input = inputRef.current;
      if (!input || !input.offsetParent) return;
      event.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!formRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    rememberSearch(q);
    setOpen(false);
    inputRef.current?.blur();
    navigate(searchHref(q));
  };

  return (
    <form
      ref={formRef}
      action="/"
      role="search"
      aria-label={zhCN.shell.search.label}
      onSubmit={submit}
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        inputRef.current?.focus();
      }}
    >
      <SearchField
        ref={inputRef}
        compact
        name="q"
        maxLength={LIMITS.searchQueryLength}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          if (!open) openPanel();
        }}
        onClear={() => inputRef.current?.focus()}
        onFocus={openPanel}
        onClick={() => {
          if (!open) openPanel();
        }}
        placeholder={t.label}
        aria-label={t.label}
        aria-controls={open ? panelId : undefined}
        autoComplete="off"
        enterKeyHint="search"
        shortcut={<Kbd>/</Kbd>}
        wrapperClassName="max-lg:[&_[data-slot=search-shortcut]]:hidden"
      />
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={t.panel}
          data-slot="search-panel"
          style={panelStyle}
          className="absolute top-full mt-2 z-60 max-h-suggest origin-top-left animate-pop-in overflow-y-auto rounded-lg bg-bg p-3 text-ink shadow-float ring-1 ring-line"
        >
          <SearchSuggestions
            query={value}
            layout="panel"
            onPick={(remember) => {
              if (remember) rememberSearch(remember);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </form>
  );
}
