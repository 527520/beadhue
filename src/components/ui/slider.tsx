'use client';

import { Slider as BaseSlider } from '@base-ui/react/slider';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';
import { Minus, Plus } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';

/** 滑杆：连续参数；旁边实时显示数值（由调用方放 <output>）。 */
export function Slider({ className, 'aria-label': ariaLabel, ...props }: ComponentProps<typeof BaseSlider.Root> & { 'aria-label'?: string }) {
  return (
    <BaseSlider.Root data-slot="slider" className={cn('w-full', className as string)} {...props}>
      <BaseSlider.Control className="flex h-5 w-full touch-none items-center select-none">
        <BaseSlider.Track className="h-1 w-full rounded-full bg-bg-emphasis">
          <BaseSlider.Indicator className="rounded-full bg-ink" />
          <BaseSlider.Thumb aria-label={ariaLabel} className="size-4 rounded-full bg-ink shadow-thumb focus-visible:focus-ring has-focus-visible:focus-ring" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}

const stepperClass = cn(
  'grid h-full w-10 shrink-0 place-items-center text-ink-3 transition-colors duration-state',
  'hover:bg-bg-muted hover:text-ink focus-visible:focus-ring disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent [&>svg]:size-4',
);

/** 数字输入：减 / 数值 / 加，同输入框外观。 */
export function NumberField({ className, 'aria-label': ariaLabel, ...props }: ComponentProps<typeof BaseNumberField.Root> & { 'aria-label'?: string }) {
  return (
    <BaseNumberField.Root data-slot="number-field" className={cn('inline-flex', className as string)} {...props}>
      <BaseNumberField.Group className="inline-flex h-control-md overflow-hidden rounded-md border border-line-strong bg-bg focus-within:border-accent focus-within:shadow-field-focus data-disabled:border-line data-disabled:bg-bg-subtle">
        <BaseNumberField.Decrement aria-label={zhCN.ui.decrement} className={cn(stepperClass, 'border-r border-line')}>
          <Minus aria-hidden="true" strokeWidth={1.75} />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input aria-label={ariaLabel} className="w-16 min-w-0 bg-transparent text-center text-body leading-none text-ink tabular-nums outline-none" />
        <BaseNumberField.Increment aria-label={zhCN.ui.increment} className={cn(stepperClass, 'border-l border-line')}>
          <Plus aria-hidden="true" strokeWidth={1.75} />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
