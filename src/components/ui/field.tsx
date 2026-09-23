'use client';

import { Field as BaseField } from '@base-ui/react/field';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label: ReactNode;
  /** 标签行右侧的附加链接（如「忘记密码？」）；放在 <label> 外，不并入字段名称。 */
  labelAside?: ReactNode;
  /** 说明写在这里，不写进占位符。 */
  hint?: ReactNode;
  /** 字段级错误：写清原因和改法；有值即进入错误态（红边 + 字段下方文字），并以 role="alert" 播报。 */
  error?: ReactNode;
  disabled?: boolean;
  name?: string;
  className?: string;
  /** 控件（Input / Textarea / Select 等 Base UI 字段控件）。 */
  children: ReactNode;
}

const labelClass = 'text-footnote font-medium text-ink';

/** 字段：标签 + 控件 + 说明 + 错误，aria 关联由 Base UI Field 自动完成。 */
export function Field({ label, labelAside, hint, error, disabled, name, className, children }: FieldProps) {
  return (
    <BaseField.Root data-slot="field" name={name} disabled={disabled} invalid={Boolean(error)} className={cn('grid gap-1.5', className)}>
      {labelAside ? (
        <div className="flex items-center justify-between gap-3">
          <BaseField.Label className={labelClass}>{label}</BaseField.Label>
          {labelAside}
        </div>
      ) : (
        <BaseField.Label className={labelClass}>{label}</BaseField.Label>
      )}
      {children}
      {hint ? <BaseField.Description className="text-caption font-normal text-ink-3">{hint}</BaseField.Description> : null}
      {error ? (
        <BaseField.Error match role="alert" className="flex items-center gap-1.5 text-footnote text-danger [&>svg]:size-4 [&>svg]:shrink-0">
          <CircleAlert aria-hidden="true" strokeWidth={1.75} />
          <span>{error}</span>
        </BaseField.Error>
      ) : null}
    </BaseField.Root>
  );
}

/** 不包控件、只作标签用的文字（如「色板」选择按钮前的标签）。 */
export function FieldLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn(labelClass, className)} {...props} />;
}

/** 表单级错误（不属于某个字段的失败，如网络错误、限流）：挂在提交按钮上方，不用表单顶部横幅。 */
export function FormAlert({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" data-slot="form-alert" className={cn('flex items-start gap-1.5 text-footnote text-danger [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0', className)}>
      <CircleAlert aria-hidden="true" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

/** 成功 / 进行中提示（role="status"）：注册后「验证邮件已发送」等。 */
export function FormNotice({ children, tone = 'success', className }: { children: ReactNode; tone?: 'success' | 'info'; className?: string }) {
  return (
    <p role="status" data-slot="form-notice" className={cn('rounded-md px-3.5 py-3 text-body-sm', tone === 'success' ? 'bg-success-soft text-success' : 'bg-info-soft text-ink-2', className)}>
      {children}
    </p>
  );
}
