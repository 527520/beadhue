'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { NO_HOVER_QUERY, useMediaQuery } from './use-media-query';

export interface TooltipProps {
  content: ReactNode;
  /** 触发元素（必须能接收 ref 与事件，如 Button / IconButton / 原生元素）。 */
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** 悬停多久后出现（原型 300ms）。 */
  delay?: number;
  disabled?: boolean;
}

/**
 * 气泡提示：深墨底白字，悬停 300ms 后出现。
 * 触屏（hover: none）不显示；触发器打开了自己的弹层（aria-expanded / data-popup-open）时不显示。
 */
export function Tooltip({ content, children, side = 'bottom', delay = 300, disabled }: TooltipProps) {
  const noHover = useMediaQuery(NO_HOVER_QUERY);
  const [open, setOpen] = useState(false);
  return (
    <BaseTooltip.Root
      open={open}
      disabled={disabled || noHover}
      onOpenChange={(next, details) => {
        const trigger = details.trigger as Element | undefined;
        if (next && trigger && (trigger.getAttribute('aria-expanded') === 'true' || trigger.hasAttribute('data-popup-open'))) return;
        setOpen(next);
      }}
    >
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} className="z-70" data-ui="">
          <BaseTooltip.Popup
            data-slot="tooltip"
            className={cn(
              'rounded-sm bg-ink px-2.5 py-1.5 text-caption leading-tight font-medium whitespace-nowrap text-on-ink',
              'transition-opacity duration-press data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
