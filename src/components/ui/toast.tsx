'use client';

import { Toast as BaseToast } from '@base-ui/react/toast';
import { CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';

/** 提示：底部居中深墨胶囊，图标 + 一句话 + 可选动作，4 秒消失；手机在底栏上方。 */
export const toastClass = cn(
  'pointer-events-auto flex min-h-11 items-center gap-2.5 rounded-full bg-ink pr-2 pl-4 text-body-sm leading-none font-medium whitespace-nowrap text-on-ink shadow-dialog',
  '[&>svg]:size-4.5 [&>svg]:shrink-0',
);
export const toastActionClass = cn(
  'inline-flex h-control-sm items-center rounded-full bg-on-ink/14 px-3 text-footnote leading-none font-semibold text-on-ink',
  'transition-colors duration-state hover:bg-on-ink/22 focus-visible:focus-ring',
);

interface ToastData {
  icon?: ReactNode;
}

type ShowToast = (message: string, options?: ShowToastOptions) => void;
const ShowToastContext = createContext<ShowToast | null>(null);
const noop: ShowToast = () => undefined;

function ToastBridge({ children }: { children: ReactNode }) {
  const manager = BaseToast.useToastManager();
  const show = useCallback<ShowToast>(
    (message, options = {}) => {
      manager.add({
        title: message,
        data: { icon: options.icon } satisfies ToastData,
        actionProps: options.action ? { children: options.action.label, onClick: options.action.onClick } : undefined,
      });
    },
    [manager],
  );
  return <ShowToastContext value={show}>{children}</ShowToastContext>;
}

/** 根布局挂一次（票 03），全站可用。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider timeout={4000} limit={3}>
      <ToastBridge>{children}</ToastBridge>
      <BaseToast.Portal>
        <BaseToast.Viewport
          data-ui=""
          data-slot="toast-viewport"
          aria-label={zhCN.ui.toastRegion}
          className="pointer-events-none fixed bottom-6 left-1/2 z-90 grid -translate-x-1/2 justify-items-center gap-2 max-md:bottom-safe-toast"
        >
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className={cn(toastClass, 'transition-[opacity,translate] duration-enter ease-standard data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0')}
    >
      {(toast.data as ToastData | undefined)?.icon ?? <CircleCheck aria-hidden="true" strokeWidth={1.75} />}
      <BaseToast.Title className="py-3 text-on-ink" />
      {toast.actionProps ? <BaseToast.Action className={toastActionClass} /> : null}
    </BaseToast.Root>
  ));
}

export interface ShowToastOptions {
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}

/** 显示一条提示；动作与按钮用同一个动词（导出 → 已导出）。没有 ToastProvider（单独渲染的组件测试）时静默。 */
export function useToast(): ShowToast {
  return useContext(ShowToastContext) ?? noop;
}

/** 静态样张（组件总览）。 */
export function ToastSample({ icon, message, action }: { icon?: ReactNode; message: string; action?: string }) {
  return (
    <div className={toastClass}>
      {icon ?? <CircleCheck aria-hidden="true" strokeWidth={1.75} />}
      <span className="py-3">{message}</span>
      {action ? <span className={toastActionClass}>{action}</span> : null}
    </div>
  );
}
