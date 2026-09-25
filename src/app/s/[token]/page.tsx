/**
 * 只读分享页 /s/[token]（决策 D38）：详情页查看器与制作卡的只读版。
 *
 * 服务端渲染，不需要登录、不暴露作者信息、不可编辑。给的是「看图 + 照着拼」需要的东西：
 * 可缩放的图纸、尺寸与颗数、完整色号清单，以及做一张自己的图纸的入口。
 *
 * robots：分享链接是私密的（拿到链接才能看），所以 noindex——
 * 用户把链接发给朋友，不代表愿意被搜索引擎收录。
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/auth/db';
import { designShares } from '@/../db/schema';
import { hashToken } from '@/lib/auth/tokens';
import { parseShareSnapshot, type ShareSnapshot } from '@/lib/share/snapshot';
import { summarizePatternColors } from '@/lib/community/queries';
import { getBoardProfile } from '@/lib/boardProfiles';
import { getBuiltinPalette } from '@/lib/palettes';
import { boardCount } from '@/lib/render/viewer';
import { longDate } from '@/lib/format';
import { SiteShell } from '@/components/shell/site-shell';
import { ShareView } from '@/components/pages/share-view';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = {
  title: zhCN.share.pageTitle,
  robots: { index: false, follow: false },
};

async function loadShare(token: string): Promise<{ snapshot: ShareSnapshot; sharedAt: Date } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const db = getDb();
  const rows = await db
    .select({ id: designShares.id, snapshot: designShares.snapshot, createdAt: designShares.createdAt })
    .from(designShares)
    .where(eq(designShares.tokenHash, hashToken(token)));
  if (rows.length === 0) return null;
  // 浏览计数：作者想知道链接有没有人看；不记录访客任何标识。
  await db
    .update(designShares)
    .set({ viewCount: sql`${designShares.viewCount} + 1` })
    .where(eq(designShares.id, rows[0].id));
  const snapshot = parseShareSnapshot(rows[0].snapshot);
  return snapshot ? { snapshot, sharedAt: rows[0].createdAt } : null;
}

export default async function SharedDesignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) notFound();
  const { snapshot } = share;
  const { pattern, palette } = snapshot;
  const board = getBoardProfile(snapshot.boardProfile);
  const { beadCount, colorUsage } = summarizePatternColors(pattern);
  const paletteLabel = palette.kind === 'builtin' ? getBuiltinPalette(palette.brand).label : zhCN.share.customPalette(palette.colors.length);
  const sharedAt = share.sharedAt.toISOString();

  return (
    <SiteShell topbarCta="secondary" tabbar={false}>
      <ShareView
        name={snapshot.name.trim() || zhCN.project.unnamed}
        pattern={pattern}
        colorCount={colorUsage.length}
        beadCount={beadCount}
        colorUsage={colorUsage}
        beadSize={`${board.beadDiameterMm}mm`}
        boards={boardCount(pattern.width, pattern.height, board.boardCols, board.boardRows)}
        boardCols={board.boardCols}
        boardRows={board.boardRows}
        paletteLabel={paletteLabel}
        sharedAt={sharedAt}
        sharedLabel={longDate(sharedAt)}
      />
    </SiteShell>
  );
}
