'use client';

import { Search, X } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { IconButton } from './icon-button';

export interface SearchFieldProps extends Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'size'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  /** 顶栏里用 44 高的紧凑版。 */
  compact?: boolean;
  /** 右侧快捷键提示（如 <Kbd>/</Kbd>），有值时让位给清除按钮。 */
  shortcut?: ReactNode;
  wrapperClassName?: string;
}

/** 胶囊搜索框：默认 --bg-muted 底，聚焦变白底 + 浮起阴影；左放大镜、右清除。 */
export function SearchField({ value, defaultValue = '', onValueChange, onClear, compact, shortcut, wrapperClassName, className, placeholder, ...props }: SearchFieldProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const update = (next: string) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  return (
    <div
      role="search"
      data-slot="search-field"
      className={cn(
        'relative flex items-center gap-2.5 rounded-full bg-bg-muted pr-2 pl-4.5 text-ink-3',
        'transition-[background-color,box-shadow] duration-state ease-standard hover:bg-bg-emphasis',
        'focus-within:bg-bg focus-within:text-ink focus-within:shadow-float focus-within:inset-ring-1 focus-within:inset-ring-line focus-within:hover:bg-bg',
        compact ? 'h-11' : 'h-control-lg',
        wrapperClassName,
      )}
    >
      <Search aria-hidden="true" strokeWidth={1.75} className="size-4.5 shrink-0" />
      <input
        type="search"
        data-slot="search-input"
        value={current}
        placeholder={placeholder ?? zhCN.ui.searchPlaceholder}
        aria-label={props['aria-label'] ?? placeholder ?? zhCN.ui.searchLabel}
        onChange={(event) => update(event.target.value)}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent text-body leading-none text-ink outline-none placeholder:text-ink-3',
          '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          className,
        )}
        {...props}
      />
      {current ? (
        <IconButton
          size="sm"
          label={zhCN.ui.clear}
          tooltip={false}
          onClick={() => {
            update('');
            onClear?.();
          }}
          className="[&_svg]:size-4"
        >
          <X aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      ) : shortcut ? (
        <span className="mr-1.5 flex">{shortcut}</span>
      ) : null}
    </div>
  );
}
