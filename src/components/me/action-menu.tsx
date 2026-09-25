'use client';

import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { iconButtonVariants } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger, menuItemClass } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useIsMobile } from '@/components/ui/use-media-query';

export type ActionEntry =
  | {
      key: string;
      label: string;
      icon: ReactNode;
      /** 普通动作；打开弹窗的动作在菜单收起、焦点回到「…」之后再执行，弹窗关闭时焦点能回到入口。 */
      onSelect?: () => void;
      /** 站内链接（可中键在新标签打开）。 */
      href?: string;
      /** 危险项：红字，放在最后并用分隔线隔开。 */
      danger?: boolean;
    }
  | 'separator';

export interface ActionMenuProps {
  /** 触发按钮的可访问名称，如「「橘猫团子」的更多操作」。 */
  label: string;
  /** 手机底部面板标题（设计名 / 作品名）。 */
  title: string;
  entries: readonly ActionEntry[];
  /** on-image：叠在图上的白色圆钮；default：列表、卡片正文里的普通图标钮。 */
  variant?: 'on-image' | 'default';
  size?: 'sm' | 'md';
  className?: string;
}

const sheetItemClass = cn(menuItemClass, 'min-h-12 text-body hover:bg-bg-muted focus-visible:bg-bg-muted');

/**
 * 「…」更多操作：桌面锚定菜单（项高 36、危险项置底分隔），
 * 手机为底部面板（标题是对象名称）。菜单项的动作延后一拍执行，保证弹窗接管焦点前菜单已经收起。
 */
export function ActionMenu({ label, title, entries, variant = 'on-image', size = 'md', className }: ActionMenuProps) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const run = (action?: () => void) => {
    setOpen(false);
    if (action) window.setTimeout(action, 0);
  };
  const triggerClass = cn(
    iconButtonVariants({ variant: variant === 'on-image' ? 'on-image' : 'default', size: variant === 'on-image' ? undefined : size }),
    variant === 'on-image' ? 'data-popup-open:bg-bg' : 'hover:bg-bg-muted data-popup-open:bg-bg-muted',
    className,
  );
  const icon = <Ellipsis aria-hidden="true" strokeWidth={1.75} />;

  if (mobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger aria-label={label} aria-haspopup="menu" className={triggerClass}>
          {icon}
        </DialogTrigger>
        <DialogContent aria-label={label}>
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div role="group" aria-label={label} className="grid">
              {entries.map((entry, index) => {
                if (entry === 'separator') return <div key={`sep-${index}`} role="separator" className="mx-1 my-1.5 h-px bg-line" />;
                const itemClass = cn(sheetItemClass, entry.danger && 'text-danger [&>svg]:text-danger');
                return entry.href ? (
                  <Link key={entry.key} href={entry.href} className={itemClass} onClick={() => setOpen(false)}>
                    {entry.icon}
                    <span className="min-w-0 flex-1">{entry.label}</span>
                  </Link>
                ) : (
                  <button key={entry.key} type="button" className={itemClass} onClick={() => run(entry.onSelect)}>
                    {entry.icon}
                    <span className="min-w-0 flex-1">{entry.label}</span>
                  </button>
                );
              })}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Tooltip content={zhCN.me.moreTip}>
        <MenuTrigger aria-label={label} className={triggerClass}>
          {icon}
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end">
        {entries.map((entry, index) => {
          if (entry === 'separator') return <MenuSeparator key={`sep-${index}`} />;
          if (entry.href) {
            return (
              <MenuLinkItem key={entry.key} icon={entry.icon} render={<Link href={entry.href} />}>
                {entry.label}
              </MenuLinkItem>
            );
          }
          return (
            <MenuItem key={entry.key} icon={entry.icon} danger={entry.danger} onClick={() => run(entry.onSelect)}>
              {entry.label}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
