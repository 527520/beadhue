'use client';

import type { ReactNode } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** 危险操作的最终动作用实心危险按钮。 */
  danger?: boolean;
  busy?: boolean;
  /** 结果未确认（需要重试同一请求）时不能关闭、不能取消。 */
  locked?: boolean;
  error?: ReactNode;
  confirmDisabled?: boolean;
  cancelLabel?: string;
  children?: ReactNode;
}

/** 确认弹窗：一句说明 + 「取消」「确认动作」；进行中或结果未确认时关不掉。 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger = false, busy = false, locked = false, error, confirmDisabled, cancelLabel = zhCN.me.cancel, children }: ConfirmDialogProps) {
  const blocked = busy || locked;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || !blocked) onOpenChange(next); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <DialogDescription className="text-body text-ink-2">{description}</DialogDescription>
          {children}
          <FormAlert>{error}</FormAlert>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={blocked} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
