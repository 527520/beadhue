'use client';

/**
 * Promise 化的确认弹窗（新组件版，替代工作台里的旧 useConfirm）：`if (await confirm({...}))`。
 * 同一时刻只有一个确认；新的请求让旧的按「取消」结束。
 */
import { Info } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { zhCN } from '@/messages/zh-CN';
import { Note } from './editor-parts';

export interface ConfirmRequest {
  title: string;
  message?: ReactNode;
  /** 附加说明（例如换色板会同时改制作规格）。 */
  note?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirmDialog(): { confirm: (request: ConfirmRequest) => Promise<boolean>; confirmDialog: ReactNode } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    setRequest(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const confirm = useCallback((next: ConfirmRequest) => {
    resolverRef.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirmDialog = (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      {request ? (
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3">
            {request.message ? <DialogDescription>{request.message}</DialogDescription> : null}
            {request.note ? <Note icon={<Info aria-hidden="true" strokeWidth={1.75} />}>{request.note}</Note> : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => settle(false)}>{request.cancelLabel ?? zhCN.common.cancel}</Button>
            <Button variant={request.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {request.confirmLabel ?? zhCN.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );

  return { confirm, confirmDialog };
}
