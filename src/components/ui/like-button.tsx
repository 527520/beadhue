'use client';

import { Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { IconButton, type IconButtonProps } from './icon-button';

export interface LikeButtonProps extends Omit<IconButtonProps, 'label' | 'children' | 'onClick' | 'aria-pressed'> {
  /** 作品标题，用于可访问名称「喜欢「…」」。 */
  title: string;
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

/** 点赞：心形填红 + 一次「豆粒落位」回弹（全站唯一的回弹动效）。 */
export function LikeButton({ title, pressed, onPressedChange, variant = 'on-image', className, ...props }: LikeButtonProps) {
  const label = pressed ? zhCN.ui.likeOn(title) : zhCN.ui.likeOff(title);
  return (
    <IconButton
      {...props}
      data-slot="like-button"
      variant={variant}
      label={label}
      tooltip={false}
      aria-pressed={pressed}
      onClick={() => onPressedChange?.(!pressed)}
      className={cn('aria-pressed:bg-bg/96 aria-pressed:text-heart aria-pressed:hover:bg-bg', className)}
    >
      <Heart
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn('transition-transform duration-state ease-standard', pressed && 'animate-bead-pop fill-heart stroke-heart')}
      />
    </IconButton>
  );
}
