import type { ReactNode } from 'react';
import { zhCN } from '@/messages/zh-CN';
import type { AdminSectionId } from './sections';

/** 页面标题 + 一句说明（去掉眉题）；右侧放本页唯一的主按钮或范围切换。 */
export function AdminPageHead({ section, actions }: { section: AdminSectionId; actions?: ReactNode }) {
  const copy = zhCN.adminUi.sections[section];
  return (
    <header className="flex items-end gap-4 max-md:flex-wrap max-md:items-start">
      <div className="min-w-0 flex-1 max-md:basis-full">
        <h1 className="text-title-1 text-ink">{copy.label}</h1>
        <p className="mt-0.5 text-body-sm text-ink-3">{copy.desc}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:[&>*]:flex-1">{actions}</div> : null}
    </header>
  );
}
