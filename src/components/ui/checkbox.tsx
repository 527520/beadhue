'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 选中统一深墨。复选 18px 方框、单选 18px 圆、开关 36×22。 */
const labelClass = 'inline-flex cursor-pointer items-start gap-2.5 text-body-sm text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-ink-4';
/** 带文字时控件与首行居中对齐（行高 22、控件 18），标签折行也不跟着整段居中。 */
const firstLine = 'mt-0.5';

export interface CheckboxProps extends ComponentProps<typeof BaseCheckbox.Root> {
  children?: ReactNode;
}

export function Checkbox({ className, children, ...props }: CheckboxProps) {
  const box = (
    <BaseCheckbox.Root
      data-slot="checkbox"
      className={cn(
        'grid size-4.5 shrink-0 place-items-center rounded-checkbox border-control border-line-strong bg-bg text-on-ink',
        'transition-colors duration-state focus-visible:focus-ring data-checked:border-ink data-checked:bg-ink',
        'data-disabled:border-line data-disabled:bg-bg-subtle',
        children ? firstLine : null,
        className as string,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex data-unchecked:hidden">
        <Check aria-hidden="true" strokeWidth={3} className="size-3" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
  if (!children) return box;
  return (
    <label className={labelClass}>
      {box}
      {children}
    </label>
  );
}

export function RadioGroup({ className, ...props }: ComponentProps<typeof BaseRadioGroup>) {
  return <BaseRadioGroup data-slot="radio-group" className={cn('grid gap-3', className as string)} {...props} />;
}

export function Radio({ className, children, ...props }: ComponentProps<typeof BaseRadio.Root> & { children?: ReactNode }) {
  const dot = (
    <BaseRadio.Root
      data-slot="radio"
      className={cn(
        'grid size-4.5 shrink-0 place-items-center rounded-full border-control border-line-strong bg-bg',
        'transition-colors duration-state focus-visible:focus-ring data-checked:border-ink data-disabled:border-line',
        children ? firstLine : null,
        className as string,
      )}
      {...props}
    >
      <BaseRadio.Indicator className="size-2 rounded-full bg-ink data-unchecked:hidden" />
    </BaseRadio.Root>
  );
  if (!children) return dot;
  return (
    <label className={labelClass}>
      {dot}
      {children}
    </label>
  );
}

/** 开关：立即生效的布尔设置。 */
export function Switch({ className, ...props }: ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-5.5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line-strong p-0.75',
        'transition-colors duration-state ease-standard focus-visible:focus-ring data-checked:bg-ink data-disabled:cursor-not-allowed',
        className as string,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className="size-4 rounded-full bg-bg shadow-thumb transition-transform duration-state ease-standard data-checked:translate-x-3.5" />
    </BaseSwitch.Root>
  );
}
