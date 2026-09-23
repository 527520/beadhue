'use client';

import { Separator as BaseSeparator } from '@base-ui/react/separator';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 发丝分隔线。 */
export function Separator({ className, orientation = 'horizontal', ...props }: ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      data-slot="separator"
      orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'vertical' ? 'w-px self-stretch' : 'h-px w-full', className as string)}
      {...props}
    />
  );
}
