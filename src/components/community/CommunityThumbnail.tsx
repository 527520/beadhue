import { thumbnailUrlFor } from '@/lib/community/thumbnailUrl';
import { thumbnailPixelSize } from '@/lib/render/thumbnailSize';

interface Props {
  revisionId: string;
  /** 图纸格数，用于给 <img> 固有尺寸，避免加载时布局跳动。 */
  width: number;
  height: number;
  label: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** admin = 走管理端专用路径，不消耗豆社公开读配额（admin-round-3 10）。 */
  scope?: 'public' | 'admin';
}

/**
 * 服务端渲染的图纸缩略图（带格线与板缝线），与详情页 PatternPreview 观感一致。
 * 普通 <img>：PNG 已按图纸格数取整渲染，next/image 的再缩放只会让格线发糊。
 */
export default function CommunityThumbnail({ revisionId, width, height, label, className, loading = 'lazy', scope = 'public' }: Props) {
  const size = thumbnailPixelSize(width, height);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailUrlFor(scope, revisionId)}
      width={size.width}
      height={size.height}
      alt={label}
      loading={loading}
      decoding="async"
      className={className ? `community-thumbnail ${className}` : 'community-thumbnail'}
    />
  );
}
