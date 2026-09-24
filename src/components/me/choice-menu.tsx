'use client';

import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { iconButtonVariants } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger, menuItemClass } from '@/components/ui/menu';
import { useIsMobile } from '@/components/ui/use-media-query';

export interface ChoiceMenuProps<T extends string> {
  /** 菜单与底部面板的标题（「排序」）。 */
  title: string;
  /** 触发按钮的可访问名称（「排序：最近编辑」）。 */
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  icon: ReactNode;
}

/** 单选菜单（原型 sortMenu）：桌面描边小按钮 + 右对齐菜单、当前项打勾；手机图标按钮 + 底部面板。 */
export function ChoiceMenu<T extends string>({ title, label, value, options, onChange, icon }: ChoiceMenuProps<T>) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const current = options.find(([id]) => id === value)?.[1] ?? '';
  if (mobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger aria-label={label} aria-haspopup="dialog" className={cn(iconButtonVariants({ size: 'sm' }), 'hover:bg-bg-muted')}>
          {icon}
        </DialogTrigger>
        <DialogContent aria-label={title}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div role="radiogroup" aria-label={title} className="grid">
              {options.map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={id === value}
                  onClick={() => {
                    setOpen(false);
                    onChange(id);
                  }}
                  className={cn(menuItemClass, 'min-h-12 text-body hover:bg-bg-muted focus-visible:bg-bg-muted')}
                >
                  <span className="min-w-0 flex-1">{text}</span>
                  {id === value ? <Check aria-hidden="true" strokeWidth={1.75} className="text-ink" /> : null}
                </button>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger aria-label={label} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'data-popup-open:border-ink')}>
        {icon}
        <span>{current}</span>
      </MenuTrigger>
      <MenuContent align="end" aria-label={title}>
        <MenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map(([id, text]) => (
            <MenuRadioItem key={id} value={id}>{text}</MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
