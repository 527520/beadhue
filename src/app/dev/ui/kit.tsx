import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 组件总览页自身的排版（目录、区块、样张框），对应原型 styles/screens/components.css。 */
export function KitSection({ id, title, rule, children }: { id: string; title: string; rule: ReactNode; children: ReactNode }) {
  return (
    <section id={`kit-${id}`} data-kit-sec={id} aria-labelledby={`kit-${id}-h`} className="grid min-w-0 scroll-mt-6 gap-4 max-md:scroll-mt-32">
      <header className="grid gap-1.5">
        <h2 id={`kit-${id}-h`} className="text-title-2 text-ink">
          {title}
        </h2>
        <p className="max-w-rule text-body-sm text-ink-3 [&_b]:font-semibold [&_b]:text-ink">{rule}</p>
      </header>
      {children}
    </section>
  );
}

export function Panel({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'specimen' | 'tight' }) {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-4 rounded-lg border border-line bg-bg p-6 max-md:p-4',
        tone === 'specimen' && 'bg-bg-subtle',
        tone === 'tight' && 'p-2 max-md:p-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Row({ children, tight, className }: { children: ReactNode; tight?: boolean; className?: string }) {
  return <div className={cn('flex flex-wrap', tight ? 'items-center gap-2' : 'items-end gap-x-8 gap-y-6 max-md:gap-x-6 max-md:gap-y-5', className)}>{children}</div>;
}

export function Spec({ caption, children, block, tall }: { caption: ReactNode; children: ReactNode; block?: boolean; tall?: boolean }) {
  return (
    <figure className={cn('m-0 grid min-w-0 gap-2.5', block ? 'justify-items-stretch' : 'justify-items-start')}>
      <div className={cn('min-h-12 gap-2', block ? 'grid' : 'flex flex-wrap', tall ? 'items-start' : 'items-center')}>{children}</div>
      <figcaption className="text-caption font-normal text-ink-3">{caption}</figcaption>
    </figure>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-caption text-ink-3', className)}>{children}</p>;
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-caption font-normal text-ink-3', className)}>{children}</span>;
}

export const SECTIONS = [
  ['tokens', '令牌'], ['button', '按钮'], ['icon-button', '图标按钮'], ['input', '输入'], ['search', '搜索'], ['chip', '芯片'],
  ['tabs', '页签'], ['seg', '分段'], ['menu', '菜单'], ['popover', '弹出层'], ['dialog', '弹窗'], ['confirm', '危险确认'],
  ['sheet', '抽屉'], ['toast', '提示'], ['badge', '徽标'], ['avatar', '头像'], ['empty', '空状态'], ['skeleton', '骨架'],
  ['pagination', '分页'], ['progress', '进度条'], ['controls', '开关与复选'], ['tooltip', '气泡提示'], ['cards', '作品卡'], ['beads', '色号色块'],
] as const;
