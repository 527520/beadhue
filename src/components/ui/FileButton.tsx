'use client';

/**
 * 文件选择按钮（admin-round-3 01）。
 *
 * 此前后台三处文件选择入口各自手写 `<label className="btn-outline btn-xs">`：
 * 类名对不上 Button 的尺寸映射（同一个控件在选图阶段是 md、之后变成 sm、补传原图又是 xs），
 * 图标尺寸也用手写数字。这里做成一个组件，复用 Button 的类名与图标尺寸表，
 * 保证「看起来像按钮」的 label 与真正的 Button 完全同档。
 *
 * 无障碍：label 包住 input，点击 label 即触发选择；禁用时用 data-disabled（原生 label
 * 没有 disabled 属性），CSS 负责 pointer-events 与配色，input 本身同时置 disabled。
 */
import type { ReactNode } from 'react';
import { buttonClassName, ICON_SIZE, type ButtonSize, type ButtonVariant } from './Button';
import Icon, { type IconName } from './Icon';

export interface FileButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  /** 选择完成后的回调；选完即清空 input，便于再次选择同一个文件。 */
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

export default function FileButton({ variant = 'secondary', size = 'md', icon, className, disabled = false, multiple = false, accept = 'image/*,.heic,.heif', onFiles, children }: FileButtonProps) {
  return <label className={buttonClassName(variant, size, className)} data-disabled={disabled || undefined}>
    {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
    {children}
    <input className="sr-only" type="file" disabled={disabled} multiple={multiple} accept={accept}
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (files.length > 0) onFiles(files);
      }} />
  </label>;
}
