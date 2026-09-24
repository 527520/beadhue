'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/dialog';
import { Field, FormAlert } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';

const d = zhCN.adminUi.dialog;

/** useAdminCommand 的只读状态（弹窗据此显示错误、「重试确认」与忙碌态）。 */
export interface CommandState { busy: boolean; uncertain: boolean; error: string | null; locked: boolean; retry: () => Promise<void> }

/**
 * 详情抽屉（原型 overlay.js openDrawer）：桌面右侧 480px，手机底部面板；标题后可跟状态徽标。
 * 底部：危险描边按钮在左、次按钮与主按钮在右；手机上危险按钮单独占一行放最后。
 */
export function AdminDrawer({ open, onOpenChange, title, badges, children, footer, label }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; badges?: ReactNode; children: ReactNode; footer?: ReactNode; label?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-label={label ?? title} className="md:w-screen">
        <SheetHeader divided>
          <SheetTitle className="flex-none truncate">{title}</SheetTitle>
          {badges ? <div className="flex shrink-0 gap-1.5">{badges}</div> : null}
        </SheetHeader>
        <SheetBody className="flex flex-1 flex-col gap-6 pt-5 pb-6 max-md:gap-5 max-md:pt-4">{children}</SheetBody>
        {footer ? <SheetFooter className="items-center max-md:flex-wrap max-md:[&>[data-slot=button]]:flex-auto max-md:[&>[data-danger]]:order-3 max-md:[&>[data-danger]]:basis-full">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}

/** 抽屉底部左右分隔。 */
export const Spacer = () => <span aria-hidden="true" className="flex-1 max-md:hidden" />;

/** 结果未确认 / 失败时的提示（弹窗与抽屉共用）：可重试同一请求（同一幂等键）。 */
export function CommandAlert({ command }: { command: CommandState }) {
  if (!command.error) return null;
  return (
    <div className="grid justify-items-start gap-2">
      <FormAlert>{command.uncertain ? d.uncertain : command.error}</FormAlert>
      {command.uncertain ? <Button size="sm" disabled={command.busy} onClick={() => void command.retry()}>{d.retry}</Button> : null}
    </div>
  );
}

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject?: string;
  label?: string;
  hint?: string;
  quick?: string[];
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  min?: number;
  defaultReason?: string;
  /** 理由之外的附加字段（如账号编号确认）；valid 为 false 时不能提交。 */
  extra?: ReactNode;
  extraValid?: boolean;
  command: CommandState;
  onConfirm: (reason: string) => void | Promise<void>;
}

/**
 * 填写理由的确认弹窗（原型 overlay.js reasonDialog）：理由至少 3 个字（写入审计），错误挂在字段下方；
 * 常用理由芯片一键填入；最终动作按钮危险操作用 danger。提交后由调用方在成功回调里关闭。
 */
export function ReasonDialog(props: ReasonDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && props.command.locked) return; onOpenChange(next); }}>
      {open ? <ReasonForm {...props} /> : null}
    </Dialog>
  );
}

function ReasonForm({ title, subject, label = d.reason, hint, quick = [], confirmLabel, tone = 'danger', min = 3, defaultReason = '', extra, extraValid = true, command, onConfirm, onOpenChange }: ReasonDialogProps) {
  const [reason, setReason] = useState(defaultReason);
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    if (reason.trim().length < min) { setInvalid(true); return; }
    if (!extraValid || command.locked) return;
    void onConfirm(reason.trim());
  };
  return (
    <DialogContent aria-label={title}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <DialogBody>
        <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
          {subject ? <DialogDescription className="text-ink-3">{subject}</DialogDescription> : null}
          {quick.length ? (
            <div role="group" aria-label={d.quick} className="flex flex-wrap gap-2">
              {quick.map((text) => <Chip key={text} variant="outline" selected={reason.trim() === text} onClick={() => { setReason(text); setInvalid(false); }}>{text}</Chip>)}
            </div>
          ) : null}
          {extra}
          <Field label={label} hint={invalid ? undefined : hint} error={invalid ? d.reasonMin(min) : undefined}>
            <Textarea rows={3} maxLength={500} value={reason} autoFocus disabled={command.locked}
              onChange={(event) => { setReason(event.target.value); if (invalid && event.target.value.trim().length >= min) setInvalid(false); }}
              onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(); }} />
          </Field>
          <CommandAlert command={command} />
        </form>
      </DialogBody>
      <DialogFooter>
        <Button disabled={command.locked} onClick={() => onOpenChange(false)}>{d.cancel}</Button>
        <Button variant={tone} loading={command.busy && !command.uncertain} disabled={command.locked || !extraValid} onClick={submit}>{confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** 不需要理由的简单确认（批量打标说明等）。 */
export function ConfirmDialog({ open, onOpenChange, title, text, confirmLabel, danger, onConfirm, command, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; text?: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void | Promise<void>; command?: CommandState; children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && command?.locked) return; onOpenChange(next); }}>
      <DialogContent aria-label={title}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody className={cn('grid gap-4')}>
          {text ? <DialogDescription>{text}</DialogDescription> : null}
          {children}
          {command ? <CommandAlert command={command} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button disabled={command?.locked} onClick={() => onOpenChange(false)}>{d.cancel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={Boolean(command?.busy && !command.uncertain)} disabled={command?.locked} onClick={() => void onConfirm()}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
