'use client';

import { Avatar as BaseAvatar } from '@base-ui/react/avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { AVATAR_BEAD_COLORS } from '@/lib/render/beadTokens';

export const avatarVariants = cva('inline-grid shrink-0 place-items-center overflow-hidden rounded-full leading-none font-semibold text-on-ink select-none', {
  variants: {
    size: {
      xs: 'size-5 text-micro',
      sm: 'size-6 text-avatar-sm',
      md: 'size-8 text-avatar-md',
      lg: 'size-12 text-avatar-lg',
      xl: 'size-18 text-avatar-xl',
    },
  },
  defaultVariants: { size: 'md' },
});

/** 按 ID 稳定地取一颗豆色作为首字底色。 */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return AVATAR_BEAD_COLORS[hash % AVATAR_BEAD_COLORS.length];
}

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  /** 用于取色的稳定 ID（公开作者 ID 等）。 */
  id: string;
  name: string;
  src?: string | null;
  /** 覆盖按 ID 取到的底色（豆色数据）。 */
  color?: string;
  className?: string;
}

/** 头像：有图显示图，否则取首字，底色按 ID 从豆粒色里取。装饰性，名字由旁边文字承载。 */
export function Avatar({ id, name, src, color, size, className }: AvatarProps) {
  return (
    <BaseAvatar.Root
      data-slot="avatar"
      aria-hidden="true"
      className={cn(avatarVariants({ size }), className)}
      style={{ backgroundColor: color ?? avatarColor(id) }}
    >
      {src ? <BaseAvatar.Image src={src} alt="" className="size-full object-cover" /> : null}
      <BaseAvatar.Fallback>{Array.from(name)[0] ?? ''}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
