'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuTrigger, menuItemClass } from '@/components/ui/menu';
import { useIsMobile } from '@/components/ui/use-media-query';

export interface ActionItem {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * 操作菜单（原型 detail.js openMenu）：桌面为锚定菜单（方向键可选），手机为同标题的底部面板。
 * trigger 是一个可接收 ref 的按钮元素（IconButton 等）。
 */
export function ActionMenu({ title, trigger, items }: { title: string; trigger: ReactElement; items: ActionItem[] }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const pick = (item: ActionItem) => {
    setOpen(false);
    // 等菜单 / 面板收起、焦点归还后再打开后续弹窗，避免两层焦点陷阱抢焦点。
    window.setTimeout(item.onSelect, 0);
  };
  if (mobile) {
    return (
      <>
        <span className="contents" onClickCapture={(event) => { event.preventDefault(); setOpen(true); }}>{trigger}</span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid pt-0">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item)}
                  className={cn(menuItemClass, 'min-h-12 text-body hover:bg-bg-muted focus-visible:bg-bg-muted', item.danger && 'text-danger [&>svg]:text-danger')}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1">{item.label}</span>
                </button>
              ))}
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={trigger} />
      <MenuContent align="end" aria-label={title}>
        {items.map((item) => (
          <MenuItem key={item.id} icon={item.icon} danger={item.danger} onClick={() => pick(item)}>{item.label}</MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
