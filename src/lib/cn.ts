import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * 合并类名并按 Tailwind 语义去重（后者覆盖前者）。
 * 自定义字阶（text-title-1 等）要登记成字号组，否则会被误判为文字颜色而与 text-ink 互相吞掉。
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'title-1', 'title-2', 'title-3', 'body', 'body-sm', 'caption', 'footnote', 'topbar', 'micro', 'tabbar', 'avatar-sm', 'avatar-md', 'avatar-lg', 'avatar-xl'] }],
      duration: ['duration-press', 'duration-state', 'duration-enter'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
