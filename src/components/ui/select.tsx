'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { fieldControlClass } from './input';
import { menuItemClass, menuPopupClass } from './menu';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { useIsMobile } from './use-media-query';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 可访问名称，也是手机底部面板的标题。 */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const triggerClass = 'inline-flex cursor-pointer items-center justify-between gap-2 text-left [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-ink-3';
const sizeClass = { md: 'h-control-md', sm: 'h-control-sm w-auto rounded-sm pr-2 pl-3 text-footnote' } as const;

/** 选择：按钮打开列表（不用原生下拉）；桌面锚定弹出，手机底部面板。 */
export function Select({ options, value, defaultValue, onValueChange, label, placeholder, disabled, name, size = 'md', className }: SelectProps) {
  const mobile = useIsMobile();
  const [inner, setInner] = useState(defaultValue ?? null);
  const current = value ?? inner;
  const change = (next: string | null) => {
    if (next === null) return;
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  const currentLabel = options.find((option) => option.value === current)?.label;

  if (mobile) return <MobileSelect {...{ options, current, currentLabel, change, label, placeholder, disabled, size, className }} />;

  return (
    <BaseSelect.Root items={options} value={current} onValueChange={change} disabled={disabled} name={name}>
      <BaseSelect.Trigger data-slot="select-trigger" aria-label={label} className={cn(fieldControlClass, triggerClass, sizeClass[size], className)}>
        <BaseSelect.Value placeholder={placeholder} className="min-w-0 truncate data-placeholder:text-ink-4" />
        <BaseSelect.Icon className="flex">
          <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink-3" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner alignItemWithTrigger={false} sideOffset={8} collisionPadding={12} className="z-85 outline-none" data-ui="">
          <BaseSelect.Popup data-slot="select" className={cn(menuPopupClass, 'min-w-(--anchor-width)')}>
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item key={option.value} value={option.value} className={menuItemClass}>
                  <BaseSelect.ItemText className="min-w-0 flex-1">{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="ml-auto flex text-ink">
                    <Check aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

interface MobileSelectProps {
  options: readonly SelectOption[];
  current: string | null;
  currentLabel?: string;
  change: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  size: 'sm' | 'md';
  className?: string;
}

function MobileSelect({ options, current, currentLabel, change, label, placeholder, disabled, size, className }: MobileSelectProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-slot="select-trigger"
        aria-haspopup="dialog"
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(fieldControlClass, triggerClass, sizeClass[size], className)}
      >
        <span className={cn('min-w-0 truncate', !currentLabel && 'text-ink-4')}>{currentLabel ?? placeholder}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.75} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div role="listbox" aria-label={label} className="grid">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === current}
                  onClick={() => {
                    change(option.value);
                    setOpen(false);
                  }}
                  className={cn(menuItemClass, 'min-h-11 hover:bg-bg-muted focus-visible:bg-bg-muted')}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {option.value === current ? <Check aria-hidden="true" strokeWidth={1.75} className="text-ink" /> : null}
                </button>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
