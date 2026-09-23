import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 徽标：软底 + 同色字；精选黄底深墨字；官方深墨底；图片上白底。dot 在文字前加一颗同色圆点。 */
export const badgeVariants = cva(
  'inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full px-2 text-caption leading-none font-semibold whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-bg-muted text-ink-2',
        info: 'bg-info-soft text-accent',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        featured: 'bg-featured text-ink',
        official: 'bg-ink text-on-ink',
        'on-image': 'bg-bg/94 text-ink shadow-badge',
      },
      dot: { true: 'before:size-1.5 before:rounded-full before:bg-current before:content-[""]' },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, dot, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, dot }), className)} {...props} />;
}
