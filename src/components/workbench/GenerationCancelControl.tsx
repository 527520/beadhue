'use client';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { perfMark } from '@/lib/perf/mark';

/**
 * 生成中的进度 + 取消控件（E2E 02 的取消门禁：点击处理器 <100ms 且按钮同步卸载）。
 *
 * 为什么单独成组件：「已点取消」这个状态必须由本组件自己持有。
 * 早前的写法把它放在 Workbench 里，点击取消要 flushSync 同步重渲染整个
 * Workbench（2400+ 行，含图纸网格/购物清单/编辑器）——只为删掉一个按钮。
 * 实测：本地约 106ms、CI 慢机器 188ms（门禁 100ms）；状态下沉到本组件后
 * 同一门禁实测 0.7ms。同步重渲染的范围就只剩这一个控件，成本与「删一个按钮」相称。
 *
 * 注意：不要为了省掉 flushSync 改成直接操作 DOM（remove()）——那样会打乱
 * React 的插入锚点，后续渲染（失焦/重新上传）会卡死。DOM 必须由 React 拥有。
 */
export interface GenerationCancelControlProps {
  /** 生成中才显示；false 时整个控件不渲染。 */
  generating: boolean;
  /** 0-100；null 表示进度未知（快速任务不显示进度槽）。 */
  progress: number | null;
  onCancel: () => void;
  labels: {
    generating: string;
    progress: string;
    cancel: string;
  };
}

export default function GenerationCancelControl({
  generating,
  progress,
  onCancel,
  labels,
}: GenerationCancelControlProps): React.ReactElement | null {
  /** 只表示「本次生成期间点过取消」，卸载重挂（父级换 key）即自动复位。 */
  const [dismissed, setDismissed] = useState(false);
  if (!generating || dismissed) return null;

  const handleClick = (): void => {
    perfMark('workbench-cancel-handler');
    // 同步卸载：门禁要求在点击处理器返回前按钮就已离开 DOM。
    // 这里同步刷新的只有本组件，不再连坐整个 Workbench。
    flushSync(() => setDismissed(true));
    perfMark('workbench-cancel-unmounted');
    perfMark('workbench-cancel-abort-start');
    onCancel();
    perfMark('workbench-cancel-abort-end');
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-primary-deep" role="status">
      <span>{labels.generating}</span>
      {/* 进度条与百分比用固定宽度槽位：出现/更新时「取消」按钮位置不跳动（可稳定点击） */}
      {progress !== null ? (
        <progress
          value={progress}
          max={100}
          className="h-2 w-48 accent-primary"
          aria-label={labels.progress}
        />
      ) : (
        <span className="inline-block h-2 w-48" aria-hidden="true" />
      )}
      <span className="inline-block w-10 tabular-nums">{progress !== null ? `${progress}%` : ''}</span>
      <button type="button" onClick={handleClick} className="btn-quiet btn-xs">
        {labels.cancel}
      </button>
    </div>
  );
}
