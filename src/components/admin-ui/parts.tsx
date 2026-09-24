'use client';

import { ChevronDown } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { adminThumbnailUrl } from '@/lib/community/thumbnailUrl';
import { Avatar } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/checkbox';

/** 后台卡片：白底 + 发丝边 + 圆角 16（原型 .adm-card）。 */
export function AdminCard({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('min-w-0 rounded-lg border border-line bg-bg', className)} {...props} />;
}

/** 卡片标题行：title-3 标题 + 右侧淡色说明（原型 .adm-card-head）。 */
export function CardHead({ title, id, aside, children, className }: { title: ReactNode; id?: string; aside?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex min-h-14 items-center gap-3 border-b border-line px-5 py-3 max-md:px-4', className)}>
      <h2 id={id} className="text-title-3 whitespace-nowrap text-ink">{title}</h2>
      {children}
      {aside ? <span className="ml-auto text-body-sm text-ink-3">{aside}</span> : null}
    </header>
  );
}

const thumbSize = { sm: 'size-6 rounded-sm', md: 'size-10 rounded-sm', lg: 'size-12 rounded-md' } as const;
/** 服务端缩略图不带边距，按边长补约 8% 白边（与原型 patternImage 的 pad 一致）。 */
const thumbPad = { sm: 'p-0.5', md: 'p-[3px]', lg: 'p-1' } as const;

/** 作品缩略图：后台专用缩略图地址（按管理员会话计量，不吃豆社公开配额）。 */
export function Thumb({ revisionId, alt = '', size = 'md', className }: { revisionId: string | null | undefined; alt?: string; size?: keyof typeof thumbSize; className?: string }) {
  const box = cn('shrink-0 bg-bg inset-ring-1 inset-ring-line', thumbSize[size], className);
  if (!revisionId) return <span aria-hidden="true" className={cn(box, 'bg-bg-subtle')} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={adminThumbnailUrl(revisionId)} alt={alt} loading="lazy" decoding="async" className={cn(box, thumbPad[size], 'object-contain')} />;
}

/** 灰底图标方块（评论、举报、批次等没有缩略图的行）。 */
export function IconTile({ children, size = 'md', className }: { children: ReactNode; size?: 'md' | 'lg' | 'sm'; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center bg-bg-muted text-ink-2 [&>svg]:size-4.5',
      size === 'lg' ? 'size-12 rounded-md' : size === 'sm' ? 'size-9 rounded-sm' : 'size-10 rounded-sm', className)}>
      {children}
    </span>
  );
}

/** 头像 + 名字（表格单元格与抽屉）。 */
export function Person({ id, name, size = 'xs', className }: { id: string; name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-45 min-w-0 items-center gap-2 text-ink-2', className)}>
      <Avatar id={id} name={name} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn('font-mono text-caption font-normal tracking-normal text-ink-3', className)}>{children}</span>
);

/** 抽屉里的键值网格（原型 .adm-dl）：两列，wide 占整行。 */
export function Dl({ items }: { items: Array<[ReactNode, ReactNode, boolean?] | null | false> }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
      {items.filter(Boolean).map((item, index) => {
        const [key, value, wide] = item as [ReactNode, ReactNode, boolean?];
        return (
          <div key={index} className={cn('grid min-w-0 gap-0.5', wide && 'col-span-full')}>
            <dt className="text-caption font-normal text-ink-3">{key}</dt>
            <dd className="m-0 min-w-0 text-body-sm [overflow-wrap:anywhere] text-ink">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** 抽屉里的区块：title-3 标题 + 右侧附加 + 内容。 */
export function DrawerSection({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <header className="flex items-baseline justify-between gap-3"><h3 className="text-title-3 text-ink">{title}</h3>{aside}</header>
      {children}
    </section>
  );
}

/** 浅底提示条（原型 .adm-note）；danger 为红色软底。 */
export function Note({ icon, children, tone = 'neutral', className }: { icon: ReactNode; children: ReactNode; tone?: 'neutral' | 'danger' | 'warning'; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-md px-3 py-2.5 text-body-sm [&>svg]:mt-0.75 [&>svg]:size-4 [&>svg]:shrink-0',
      tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-bg-subtle text-ink-2 [&>svg]:text-ink-3', className)}>
      {icon}<span className="min-w-0">{children}</span>
    </p>
  );
}

/** 等宽只读代码块（堆栈、上下文、语句）。 */
export function CodeBlock({ children }: { children: ReactNode }) {
  return <pre className="max-h-80 overflow-auto rounded-md bg-bg-subtle p-3 font-mono text-caption leading-relaxed font-normal whitespace-pre-wrap text-ink-2">{children}</pre>;
}

/** 可折叠区块（原生 details，焦点与键盘由浏览器提供）。 */
export function Collapsible({ summary, children, defaultOpen }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-md border border-line">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3.5 text-body-sm font-semibold text-ink focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
        {summary}<ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 text-ink-3 transition-transform duration-state group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-line p-3.5">{children}</div>
    </details>
  );
}

/** 带名字的开关：Base UI Switch 会用自己的 aria-labelledby 覆盖 aria-label，名字必须指向页面上的文字元素。 */
export function NamedSwitch({ label, hint, checked, disabled, onCheckedChange, visibleLabel = false }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void; visibleLabel?: boolean }) {
  const id = useId();
  const control = <Switch aria-labelledby={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />;
  if (!visibleLabel) return <><span id={id} className="sr-only">{label}</span>{control}</>;
  return (
    <div className="flex items-center justify-between gap-4">
      <span><b id={id} className="block text-body-sm font-semibold text-ink">{label}</b>{hint ? <small className="text-caption font-normal text-ink-3">{hint}</small> : null}</span>
      {control}
    </div>
  );
}
