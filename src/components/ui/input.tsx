'use client';

import { Input as BaseInput } from '@base-ui/react/input';
import { Field as BaseField } from '@base-ui/react/field';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 输入框外观：高 40（触屏 44）、圆角 12、白底 + --line-strong；聚焦主色边 + 3px 光晕；错误红边。 */
export const fieldControlClass = cn(
  'w-full rounded-md border border-line-strong bg-bg px-3.5 text-body leading-none text-ink',
  'transition-[border-color,box-shadow] duration-state ease-standard placeholder:text-ink-4',
  'hover:border-ink-3 focus:border-accent focus:shadow-field-focus focus:outline-none',
  'aria-invalid:border-danger aria-invalid:focus:shadow-field-invalid data-invalid:border-danger data-invalid:focus:shadow-field-invalid',
  'disabled:border-line disabled:bg-bg-subtle disabled:text-ink-4 disabled:hover:border-line',
);

export function Input({ className, ...props }: ComponentProps<typeof BaseInput>) {
  return <BaseInput data-slot="input" className={cn(fieldControlClass, 'h-control-md', className as string)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <BaseField.Control
      data-slot="textarea"
      render={<textarea />}
      className={cn(fieldControlClass, 'min-h-24 resize-y py-3 leading-relaxed', className)}
      {...(props as ComponentProps<typeof BaseField.Control>)}
    />
  );
}
