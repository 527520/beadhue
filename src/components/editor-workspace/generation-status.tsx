'use client';

/**
 * 编辑器里的生成进度胶囊（D35：进度 + 取消），浮在画布上方正中。
 * 取消门禁沿用旧控件的约定：点击处理器内同步卸载按钮（只 flushSync 本组件），再停机回滚；父级每轮换 key 复位。
 */
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { perfMark } from '@/lib/perf/mark';
import { zhCN } from '@/messages/zh-CN';

export function GenerationStatus({ progress, onCancel }: { progress: number | null; onCancel: () => void }) {
  const t = zhCN.editorWorkspace;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const cancel = () => {
    perfMark('workbench-cancel-handler');
    flushSync(() => setDismissed(true));
    perfMark('workbench-cancel-unmounted');
    perfMark('workbench-cancel-abort-start');
    onCancel();
    perfMark('workbench-cancel-abort-end');
  };
  return (
    <div role="status" className="flex h-control-md items-center gap-3 rounded-full bg-bg pr-1 pl-4 text-body-sm text-ink-2 shadow-float ring-1 ring-line">
      <span aria-hidden="true" className="size-4 animate-spinner rounded-full border-2 border-ink border-r-transparent" />
      <span className="whitespace-nowrap">{t.generating}</span>
      {/* 固定宽度槽位：进度出现 / 更新时「取消」不跳位。 */}
      {progress !== null ? (
        <progress value={progress} max={100} aria-label={t.generatingProgress} className="h-1 w-24 accent-ink" />
      ) : (
        <span aria-hidden="true" className="inline-block h-1 w-24" />
      )}
      <span className="inline-block w-9 text-right tabular-nums">{progress !== null ? `${progress}%` : ''}</span>
      <button type="button" onClick={cancel} className="inline-flex h-control-sm items-center rounded-full px-3 text-footnote font-semibold text-ink hover:bg-bg-muted focus-visible:focus-ring">
        {t.cancel}
      </button>
    </div>
  );
}
