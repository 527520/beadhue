'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip, type TooltipProps } from './tooltip';

/** 圆形图标按钮 32 / 40 / 48；选中态（aria-pressed）深墨底白图标。 */
export const iconButtonVariants = cva(
  [
    'inline-grid shrink-0 place-items-center rounded-full text-ink select-none',
    'transition duration-state ease-standard focus-visible:focus-ring active:not-disabled:scale-94',
    'aria-pressed:bg-ink aria-pressed:text-on-ink',
    'disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent',
  ],
  {
    variants: {
      size: {
        sm: 'size-control-sm [&_svg]:size-4.5',
        md: 'size-control-md [&_svg]:size-5',
        lg: 'size-control-lg [&_svg]:size-6',
      },
      variant: {
        default: 'hover:bg-bg-muted aria-pressed:hover:bg-ink',
        filled: 'bg-bg-muted hover:bg-bg-emphasis aria-pressed:hover:bg-ink',
        'on-image': 'size-9 bg-bg/92 shadow-on-image hover:bg-bg',
      },
    },
    defaultVariants: { size: 'md', variant: 'default' },
  },
);

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, 'aria-label' | 'children'> &
  VariantProps<typeof iconButtonVariants> & {
    /** 可访问名称（必填）；默认也作为桌面 Tooltip 文案。 */
    label: string;
    children: ReactNode;
    /** Tooltip 文案；false 不显示。 */
    tooltip?: ReactNode | false;
    tooltipSide?: TooltipProps['side'];
  };

export function IconButton({ className, variant, size, label, tooltip, tooltipSide, type, children, ...props }: IconButtonProps) {
  const button = (
    <BaseButton
      data-slot="icon-button"
      type={type ?? 'button'}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className as string)}
      {...props}
    >
      {children}
    </BaseButton>
  );
  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip ?? label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
