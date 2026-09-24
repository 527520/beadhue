'use client';

/**
 * 选择按钮 + 弹出列表：色板（色带 + 名称 + 颜色数 · 豆径）与制作规格（不兼容的保留但禁用并写明原因）。
 * 原型 editor/catalog.js 的 pickerButton / paletteMenu / specMenu；桌面锚定弹出，手机底部面板。
 */
import { Check, ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fieldControlClass } from '@/components/ui/input';
import { menuItemClass } from '@/components/ui/menu';
import type { BoardProfileId } from '@/lib/boardProfiles';
import { zhCN } from '@/messages/zh-CN';
import type { PaletteChoice, SpecChoice } from './palette-choices';

export function PaletteBand({ colors, max = colors.length, className }: { colors: readonly string[]; max?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 pl-0.75', className)}>
      {colors.slice(0, max).map((hex, index) => (
        <i key={index} className="-ml-0.75 size-2.5 rounded-full ring-1 ring-bg" style={{ backgroundColor: hex }} />
      ))}
    </span>
  );
}

interface PickerButtonProps {
  label: string;
  value: string;
  prefix?: ReactNode;
  disabled?: boolean;
}

function PickerTrigger({ label, value, prefix, disabled }: PickerButtonProps) {
  return (
    <PopoverTrigger
      disabled={disabled}
      aria-label={`${label}：${value}`}
      aria-haspopup="listbox"
      className={cn(fieldControlClass, 'inline-flex h-control-md cursor-pointer items-center gap-2 text-left text-body-sm [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-ink-3')}
    >
      {prefix}
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <ChevronDown aria-hidden="true" strokeWidth={1.75} />
    </PopoverTrigger>
  );
}

function OptionRow({ name, meta, selected, disabled, lead, onPick }: { name: string; meta: string; selected: boolean; disabled?: boolean; lead?: ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={onPick}
      className={cn(menuItemClass, 'min-h-12 py-1 hover:bg-bg-muted focus-visible:bg-bg-muted disabled:cursor-not-allowed disabled:hover:bg-transparent')}
    >
      {lead}
      <span className="grid min-w-0 flex-1">
        <span className={cn('truncate text-body-sm', disabled ? 'text-ink-4' : 'text-ink')}>{name}</span>
        <span className={cn('text-caption font-normal', disabled ? 'text-ink-4' : 'text-ink-3')}>{meta}</span>
      </span>
      {selected ? <Check aria-hidden="true" strokeWidth={1.75} className="text-ink" /> : null}
    </button>
  );
}

export function PalettePicker({ choices, value, onChange, disabled, label = zhCN.create.paletteLabel }: { choices: readonly PaletteChoice[]; value: string; onChange: (value: string) => void; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const current = choices.find((choice) => choice.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={zhCN.create.paletteMenuTitle}>
      <PickerTrigger label={label} value={current?.name ?? ''} disabled={disabled} prefix={current ? <PaletteBand colors={current.band} max={4} /> : null} />
      <PopoverContent align="start" className="max-h-popover-list overflow-y-auto">
        <div role="listbox" aria-label={zhCN.create.paletteMenuTitle} className="grid">
          {choices.map((choice) => (
            <OptionRow
              key={choice.value}
              name={choice.name}
              meta={choice.meta}
              selected={choice.value === value}
              lead={<PaletteBand colors={choice.band} />}
              onPick={() => {
                setOpen(false);
                onChange(choice.value);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SpecPicker({ choices, value, onChange, disabled, label = zhCN.create.specLabel }: { choices: readonly SpecChoice[]; value: BoardProfileId; onChange: (value: BoardProfileId) => void; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const current = choices.find((choice) => choice.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={zhCN.create.specMenuTitle}>
      <PickerTrigger label={label} value={current?.label ?? ''} disabled={disabled} />
      <PopoverContent align="start">
        <div role="listbox" aria-label={zhCN.create.specMenuTitle} className="grid">
          {choices.map((choice) => (
            <OptionRow
              key={choice.id}
              name={choice.label}
              meta={choice.meta}
              selected={choice.id === value}
              disabled={choice.disabled}
              onPick={() => {
                setOpen(false);
                onChange(choice.id);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
