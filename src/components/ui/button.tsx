'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 按钮（design.md §3）：全部胶囊形；禁用为 --bg-muted 底 + --ink-4 字，不用半透明。 */
export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center rounded-full border border-transparent font-semibold whitespace-nowrap select-none',
    'transition duration-state ease-standard focus-visible:focus-ring active:not-disabled:scale-97',
    '[&_svg]:shrink-0 [&_svg]:-mx-0.5',
    'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-bg-muted disabled:text-ink-4',
  ],
  {
    variants: {
      size: {
        sm: 'h-control-sm gap-1.5 px-3 text-footnote leading-none [&_svg]:size-4',
        md: 'h-control-md gap-2 px-4.5 text-body-sm leading-none [&_svg]:size-4.5',
        lg: 'h-control-lg gap-2 px-6 text-body leading-none [&_svg]:size-4.5',
      },
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press',
        secondary: 'bg-bg-muted text-ink hover:bg-bg-emphasis',
        outline: 'border-line-strong bg-bg text-ink hover:border-ink',
        ghost: 'px-3 text-ink hover:bg-bg-muted',
        danger: 'bg-danger text-on-accent hover:bg-danger-hover',
        'danger-outline': 'border-danger/36 bg-bg text-danger hover:border-danger hover:bg-danger-soft',
        'danger-ghost': 'px-3 text-danger hover:bg-danger-soft',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { size: 'md', variant: 'secondary' },
  },
);

const spinnerTone: Record<NonNullable<VariantProps<typeof buttonVariants>['variant']>, string> = {
  primary: 'text-on-accent',
  danger: 'text-on-accent',
  secondary: 'text-ink',
  outline: 'text-ink',
  ghost: 'text-ink',
  'danger-outline': 'text-danger',
  'danger-ghost': 'text-danger',
};

export type ButtonProps = ComponentProps<typeof BaseButton> &
  VariantProps<typeof buttonVariants> & {
    /** 加载中：文字位隐去、居中出现旋转环，按钮宽度不变。 */
    loading?: boolean;
  };

export function Button({ className, variant, size, block, loading = false, children, disabled, type, ...props }: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      type={type ?? 'button'}
      aria-busy={loading || undefined}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size, block }), loading && 'pointer-events-none text-transparent', className as string)}
      {...props}
    >
      {children}
      {loading ? (
        <span
          aria-hidden="true"
          data-slot="button-spinner"
          className={cn('absolute size-4 animate-spinner rounded-full border-2 border-current border-r-transparent', spinnerTone[variant ?? 'secondary'])}
        />
      ) : null}
    </BaseButton>
  );
}
