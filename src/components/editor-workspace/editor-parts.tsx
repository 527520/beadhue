'use client';

/** 编辑器里反复出现的小件：豆粒色块、面板分节、带说明的开关行（原型 editor.css .bead-sw / .ed-sec / .ed-switch）。 */
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Switch } from '@/components/ui/checkbox';

const swatchSize = { sm: 'size-4', md: 'size-5', lg: 'size-7', xl: 'size-12' } as const;

/** 带孔的圆豆色块。 */
export function BeadSwatch({ hex, size = 'md', className }: { hex: string | null | undefined; size?: keyof typeof swatchSize; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block shrink-0 rounded-full inset-ring-1 inset-ring-ink/12', hex ? null : 'bg-bg-muted', swatchSize[size], className)}
      style={hex ? { backgroundColor: hex } : undefined}
    >
      <span className="absolute inset-1/3 rounded-full bg-bg/58" />
    </span>
  );
}

export function PanelSection({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn('grid gap-3 border-b border-line py-4 last:border-b-0 [&>*]:min-w-0', className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="flex items-baseline gap-1.5 text-title-3 text-ink">
      {children}
      {count !== undefined ? <span className="text-body-sm font-normal text-ink-3 tabular-nums">{count}</span> : null}
    </h3>
  );
}

export function FieldLabel({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <Tag htmlFor={htmlFor} className={cn('text-footnote font-semibold text-ink', className)}>
      {children}
    </Tag>
  );
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('block text-caption font-normal text-ink-3', className)}>{children}</span>;
}

/** 左侧标签 + 说明，右侧开关；整行可点。 */
export function SwitchRow({ label, hint, checked, onCheckedChange, disabled }: { label: string; hint?: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {hint ? <Hint>{hint}</Hint> : null}
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(next) => onCheckedChange(next)} aria-label={label} />
    </div>
  );
}

/** 说明条：浅底 + 图标 + 文字（原型 .ed-dialog-note / .ed-callout）。 */
export function Note({ icon, children, tone = 'neutral', className }: { icon?: ReactNode; children: ReactNode; tone?: 'neutral' | 'warning'; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-md p-3 text-body-sm text-ink-2 [&>svg]:mt-0.75 [&>svg]:size-4 [&>svg]:shrink-0', tone === 'warning' ? 'bg-warning-soft [&>svg]:text-warning' : 'bg-bg-subtle [&>svg]:text-ink-3', className)}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
