'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Drawer } from '@base-ui/react/drawer';
import { X } from 'lucide-react';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { iconButtonVariants } from './icon-button';
import { useIsMobile } from './use-media-query';

/**
 * 弹窗：桌面居中（Base UI Dialog），手机宽度（< 768）自动变底部面板（Base UI Drawer：拖动条、下滑关闭、软键盘避让）。
 * 焦点陷阱与归还、Esc、点遮罩关闭由 Base UI 提供。桌面右侧抽屉见 Sheet。
 */
type Mode = 'dialog' | 'sheet';
const ModeContext = createContext<Mode>('dialog');

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 为 true 时手机上也保持居中弹窗（极少用）。 */
  forceDialog?: boolean;
  children: ReactNode;
}

export function Dialog({ open, defaultOpen, onOpenChange, forceDialog, children }: DialogProps) {
  const mobile = useIsMobile();
  const mode: Mode = mobile && !forceDialog ? 'sheet' : 'dialog';
  const handle = (next: boolean) => onOpenChange?.(next);
  return (
    <ModeContext value={mode}>
      {mode === 'sheet' ? (
        <Drawer.Root open={open} defaultOpen={defaultOpen} onOpenChange={handle}>
          <Drawer.VirtualKeyboardProvider>{children}</Drawer.VirtualKeyboardProvider>
        </Drawer.Root>
      ) : (
        <BaseDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={handle}>
          {children}
        </BaseDialog.Root>
      )}
    </ModeContext>
  );
}

export function useDialogMode(): Mode {
  return useContext(ModeContext);
}

export function DialogTrigger(props: Omit<ComponentProps<typeof BaseDialog.Trigger>, 'handle'>) {
  const mode = useDialogMode();
  return mode === 'sheet' ? <Drawer.Trigger data-slot="dialog-trigger" {...props} /> : <BaseDialog.Trigger data-slot="dialog-trigger" {...props} />;
}

const dialogSizes = { sm: 'max-w-dialog-sm', md: 'max-w-dialog-md', lg: 'max-w-dialog-lg', full: 'max-w-none' } as const;

export interface DialogContentProps {
  size?: keyof typeof dialogSizes;
  /** 桌面样式：居中弹窗或右侧抽屉（480px）；手机统一为底部面板。 */
  variant?: 'center' | 'side';
  className?: string;
  children: ReactNode;
  /** 可访问名称（没有 DialogTitle 时必填）。 */
  'aria-label'?: string;
  initialFocus?: ComponentProps<typeof BaseDialog.Popup>['initialFocus'];
}

const backdropClass = 'fixed inset-0 z-80 bg-scrim transition-opacity duration-enter ease-standard data-ending-style:opacity-0 data-starting-style:opacity-0';
const popupBase = 'flex w-full flex-col overflow-hidden bg-bg text-body text-ink-2 shadow-dialog outline-none';

export function DialogContent({ size = 'sm', variant = 'center', className, children, initialFocus, ...rest }: DialogContentProps) {
  const mode = useDialogMode();
  if (mode === 'sheet') {
    return (
      <Drawer.Portal>
        <Drawer.Backdrop className={cn(backdropClass, 'sheet-backdrop data-swiping:duration-0')} />
        <Drawer.Viewport data-ui="" className="fixed inset-0 z-80 flex items-end">
          <Drawer.Popup
            data-slot="dialog-content"
            data-variant="sheet"
            aria-label={rest['aria-label']}
            initialFocus={initialFocus}
            className={cn(
              popupBase,
              'max-h-sheet rounded-t-xl pb-safe sheet-swipe-y transition-[translate,transform] duration-enter ease-standard data-swiping:duration-0',
              'data-ending-style:translate-y-full data-starting-style:translate-y-full',
              variant === 'side' && 'h-sheet',
              className,
            )}
          >
            <div aria-hidden="true" data-slot="sheet-handle" className="mx-auto mt-2 h-1.25 w-9 shrink-0 rounded-full bg-line-strong" />
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    );
  }
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdropClass} />
      <BaseDialog.Viewport data-ui="" className={cn('fixed inset-0 z-80 grid', variant === 'side' ? 'place-items-stretch justify-end' : 'place-items-center p-6')}>
        <BaseDialog.Popup
          data-slot="dialog-content"
          data-variant={variant === 'side' ? 'side' : 'dialog'}
          aria-label={rest['aria-label']}
          initialFocus={initialFocus}
          className={cn(
            popupBase,
            'transition-[opacity,translate,scale] duration-enter ease-standard data-ending-style:opacity-0 data-starting-style:opacity-0',
            variant === 'side'
              ? 'h-dvh max-w-sheet rounded-l-xl data-ending-style:translate-x-10 data-starting-style:translate-x-10'
              : cn('max-h-dialog rounded-xl data-ending-style:scale-98 data-starting-style:translate-y-3 data-starting-style:scale-98', dialogSizes[size]),
            className,
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

/** 标题行：title-2 标题 + 右上关闭按钮。 */
export function DialogHeader({ children, className, divided }: { children: ReactNode; className?: string; divided?: boolean }) {
  const mode = useDialogMode();
  return (
    <header
      data-slot="dialog-header"
      className={cn(
        'flex shrink-0 items-center gap-3',
        mode === 'sheet' ? 'pt-3 pr-4 pb-2 pl-5' : 'pt-5 pr-5 pb-3 pl-6',
        divided && 'border-b border-line pb-4',
        className,
      )}
    >
      {children}
      <DialogCloseIcon />
    </header>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title data-slot="dialog-title" className={cn('min-w-0 flex-1 text-title-2 text-ink', className as string)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof BaseDialog.Description>) {
  return <BaseDialog.Description data-slot="dialog-description" className={cn('text-body-sm text-ink-2', className as string)} {...props} />;
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  const mode = useDialogMode();
  return <div data-slot="dialog-body" className={cn('min-h-0 overflow-auto', mode === 'sheet' ? 'px-5 pt-1 pb-4' : 'px-6 pt-1 pb-5', className)} {...props} />;
}

/** 底部按钮行：右对齐（次在左、主在右）；手机上按钮等分并升到 48 高。 */
export function DialogFooter({ className, ...props }: ComponentProps<'footer'>) {
  const mode = useDialogMode();
  return (
    <footer
      data-slot="dialog-footer"
      className={cn(
        'flex shrink-0 justify-end gap-2 border-t border-line',
        mode === 'sheet' ? 'px-4 pt-3 pb-4 [&>[data-slot=button]]:h-control-lg [&>[data-slot=button]]:flex-1' : 'px-6 pt-4 pb-5',
        className,
      )}
      {...props}
    />
  );
}

export function DialogClose(props: ComponentProps<typeof BaseDialog.Close>) {
  return <BaseDialog.Close data-slot="dialog-close" {...props} />;
}

function DialogCloseIcon() {
  return (
    <BaseDialog.Close data-slot="dialog-close" aria-label={zhCN.ui.close} className={cn(iconButtonVariants({ size: 'sm' }), 'ml-auto hover:bg-bg-muted')}>
      <X aria-hidden="true" strokeWidth={1.75} />
    </BaseDialog.Close>
  );
}

/** 右侧抽屉（后台详情）：桌面 480px 右侧滑出，手机底部面板。 */
export const Sheet = Dialog;
export const SheetTrigger = DialogTrigger;
export function SheetContent(props: Omit<DialogContentProps, 'variant' | 'size'>) {
  return <DialogContent {...props} variant="side" />;
}
export { DialogHeader as SheetHeader, DialogTitle as SheetTitle, DialogBody as SheetBody, DialogFooter as SheetFooter, DialogClose as SheetClose };

/** 静态样张（组件总览）：与真实弹窗同样的外观，放在页面流里。 */
export function DialogSample({ title, children, footer, className }: { title: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={title} className={cn(popupBase, 'max-w-dialog-static rounded-xl max-md:max-w-none max-md:rounded-b-none', className)}>
      <div aria-hidden="true" className="mx-auto mt-2 h-1.25 w-9 shrink-0 rounded-full bg-line-strong md:hidden" />
      <div className="flex items-center gap-3 pt-5 pr-5 pb-3 pl-6 max-md:pt-3 max-md:pr-4 max-md:pb-2 max-md:pl-5">
        <h2 className="min-w-0 flex-1 text-title-2 text-ink">{title}</h2>
        <span aria-hidden="true" className={cn(iconButtonVariants({ size: 'sm' }), 'ml-auto')}>
          <X strokeWidth={1.75} />
        </span>
      </div>
      <div className="px-6 pt-1 pb-5 max-md:px-5 max-md:pb-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-line px-6 pt-4 pb-5 max-md:px-4 max-md:pt-3 max-md:pb-4 max-md:[&>*]:h-control-lg max-md:[&>*]:flex-1">{footer}</div> : null}
    </div>
  );
}
