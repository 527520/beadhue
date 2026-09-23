'use client';

import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 菜单外框与项（Popover / Select 共用）：圆角 16、浮起阴影 + 发丝边、项高 36、宽度按内容 200–360。 */
export const menuPopupClass = cn(
  'popover-width rounded-lg bg-bg p-1.5 text-ink shadow-float ring-1 ring-line outline-none',
  'origin-(--transform-origin) transition-[opacity,scale,translate] duration-enter ease-standard',
  'data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:scale-98 data-starting-style:opacity-0',
);
export const menuItemClass = cn(
  'flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-menu-item px-2.5 text-left text-body-sm leading-tight text-ink outline-none select-none',
  'data-highlighted:bg-bg-muted data-disabled:cursor-not-allowed data-disabled:text-ink-4',
  '[&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-ink-3',
);

export const Menu = BaseMenu.Root;

export function MenuTrigger(props: ComponentProps<typeof BaseMenu.Trigger>) {
  return <BaseMenu.Trigger data-slot="menu-trigger" {...props} />;
}

export interface MenuContentProps extends ComponentProps<typeof BaseMenu.Popup> {
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function MenuContent({ className, align = 'start', side = 'bottom', ...props }: MenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} side={side} sideOffset={8} collisionPadding={12} className="z-60 outline-none" data-ui="">
        <BaseMenu.Popup data-slot="menu" className={cn(menuPopupClass, className as string)} {...props} />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export interface MenuItemProps extends ComponentProps<typeof BaseMenu.Item> {
  icon?: ReactNode;
  /** 右侧附注（快捷键等）。 */
  trail?: ReactNode;
  /** 危险项：红字，放在最后并用分隔线隔开。 */
  danger?: boolean;
}

export function MenuItem({ className, icon, trail, danger, children, ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item data-slot="menu-item" className={cn(menuItemClass, danger && 'text-danger [&>svg]:text-danger', className as string)} {...props}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      {trail ? <span className="ml-auto text-caption font-normal text-ink-3">{trail}</span> : null}
    </BaseMenu.Item>
  );
}

export const MenuRadioGroup = BaseMenu.RadioGroup;

export function MenuRadioItem({ className, icon, children, ...props }: ComponentProps<typeof BaseMenu.RadioItem> & { icon?: ReactNode }) {
  return (
    <BaseMenu.RadioItem data-slot="menu-radio-item" className={cn(menuItemClass, className as string)} {...props}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      <BaseMenu.RadioItemIndicator className="ml-auto flex text-ink [&>svg]:size-4.5">
        <Check aria-hidden="true" strokeWidth={1.75} />
      </BaseMenu.RadioItemIndicator>
    </BaseMenu.RadioItem>
  );
}

export function MenuCheckboxItem({ className, icon, children, ...props }: ComponentProps<typeof BaseMenu.CheckboxItem> & { icon?: ReactNode }) {
  return (
    <BaseMenu.CheckboxItem data-slot="menu-checkbox-item" className={cn(menuItemClass, className as string)} {...props}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      <BaseMenu.CheckboxItemIndicator className="ml-auto flex text-ink [&>svg]:size-4.5">
        <Check aria-hidden="true" strokeWidth={1.75} />
      </BaseMenu.CheckboxItemIndicator>
    </BaseMenu.CheckboxItem>
  );
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof BaseMenu.Separator>) {
  return <BaseMenu.Separator data-slot="menu-separator" className={cn('mx-1 my-1.5 h-px bg-line', className as string)} {...props} />;
}

export function MenuGroup(props: ComponentProps<typeof BaseMenu.Group>) {
  return <BaseMenu.Group {...props} />;
}

/** 分组标签：必须放在 MenuGroup 或 MenuRadioGroup 里。 */
export function MenuLabel({ className, ...props }: ComponentProps<typeof BaseMenu.GroupLabel>) {
  return <BaseMenu.GroupLabel data-slot="menu-label" className={cn('px-2.5 pt-2 pb-1 text-caption text-ink-3', className as string)} {...props} />;
}

/** 静态菜单样张（组件总览、说明页）：同样的外观，但不是交互菜单。 */
export function MenuSample({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(menuPopupClass, 'w-60 transition-none', className)} {...props} />;
}
export function MenuSampleItem({ icon, trail, danger, checked, children }: { icon?: ReactNode; trail?: ReactNode; danger?: boolean; checked?: boolean; children: ReactNode }) {
  return (
    <div className={cn(menuItemClass, 'cursor-default', danger && 'text-danger [&>svg]:text-danger')}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      {trail ? <span className="ml-auto text-caption font-normal text-ink-3">{trail}</span> : null}
      {checked ? <Check aria-hidden="true" strokeWidth={1.75} className="ml-auto text-ink" /> : null}
    </div>
  );
}
