'use client';

import { Field as BaseField } from '@base-ui/react/field';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label: ReactNode;
  /** 说明写在这里，不写进占位符。 */
  hint?: ReactNode;
  /** 字段级错误：写清原因和改法；有值即进入错误态（红边 + 字段下方文字）。 */
  error?: ReactNode;
  disabled?: boolean;
  name?: string;
  className?: string;
  /** 控件（Input / Textarea / Select 等 Base UI 字段控件）。 */
  children: ReactNode;
}

/** 字段：标签 + 控件 + 说明 + 错误，aria 关联由 Base UI Field 自动完成。 */
export function Field({ label, hint, error, disabled, name, className, children }: FieldProps) {
  return (
    <BaseField.Root data-slot="field" name={name} disabled={disabled} invalid={Boolean(error)} className={cn('grid gap-1.5', className)}>
      <BaseField.Label className="text-footnote font-medium text-ink">{label}</BaseField.Label>
      {children}
      {hint ? <BaseField.Description className="text-caption font-normal text-ink-3">{hint}</BaseField.Description> : null}
      {error ? (
        <BaseField.Error match className="flex items-center gap-1.5 text-footnote text-danger [&>svg]:size-4 [&>svg]:shrink-0">
          <CircleAlert aria-hidden="true" strokeWidth={1.75} />
          <span>{error}</span>
        </BaseField.Error>
      ) : null}
    </BaseField.Root>
  );
}

/** 不包控件、只作标签用的文字（如「色板」选择按钮前的标签）。 */
export function FieldLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-footnote font-medium text-ink', className)} {...props} />;
}
