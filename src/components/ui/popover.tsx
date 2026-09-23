'use client';

import { Popover as BasePopover } from '@base-ui/react/popover';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { menuPopupClass } from './menu';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog';
import { useIsMobile } from './use-media-query';

/**
 * 弹出层：桌面锚定触发器；传入 sheetTitle 时手机自动变成底部面板（同一个组件，内容相同）。
 */
const SheetContext = createContext<string | null>(null);

export interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 手机底部面板的标题；不传则手机上也用锚定弹出层。 */
  sheetTitle?: string;
  children: ReactNode;
}

export function Popover({ sheetTitle, open, defaultOpen, onOpenChange, children }: PopoverProps) {
  const mobile = useIsMobile();
  if (mobile && sheetTitle) {
    return (
      <SheetContext value={sheetTitle}>
        <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      </SheetContext>
    );
  }
  return (
    <BasePopover.Root open={open} defaultOpen={defaultOpen} onOpenChange={(next) => onOpenChange?.(next)}>
      {children}
    </BasePopover.Root>
  );
}

export function PopoverTrigger(props: ComponentProps<typeof BasePopover.Trigger>) {
  const sheet = useContext(SheetContext);
  if (sheet) return <DialogTrigger {...(props as ComponentProps<typeof DialogTrigger>)} />;
  return <BasePopover.Trigger data-slot="popover-trigger" {...props} />;
}

export interface PopoverContentProps extends Omit<ComponentProps<typeof BasePopover.Popup>, 'children'> {
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** 宽版 560（筛选、搜索建议）。 */
  wide?: boolean;
  children: ReactNode;
}

export function PopoverContent({ className, align = 'end', side = 'bottom', wide, children, ...props }: PopoverContentProps) {
  const sheet = useContext(SheetContext);
  if (sheet) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sheet}</DialogTitle>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    );
  }
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner align={align} side={side} sideOffset={8} collisionPadding={12} className="z-60" data-ui="">
        <BasePopover.Popup data-slot="popover" className={cn(menuPopupClass, wide && 'popover-width-wide max-w-none p-3', className as string)} {...props}>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverClose(props: ComponentProps<typeof BasePopover.Close>) {
  const sheet = useContext(SheetContext);
  if (sheet) return <DialogClose {...(props as ComponentProps<typeof DialogClose>)} />;
  return <BasePopover.Close {...props} />;
}
