import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listManagedCommunityWorks } from '@/lib/community/adminQueries';

/**
 * 某个标签的候选作品（admin-round-3 08）：默认只返回**还没打这个标签**的作品，供标签管理里批量打标勾选。
 * 复用作品管理的列表查询，所以筛选、分页与总数口径完全一致。
 */
async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApiActor('community:moderate');
  const tagId = z.uuid().parse((await params).id);
  const search = new URL(request.url).searchParams;
  const input = Object.fromEntries(['q', 'page', 'size'].flatMap((key) => search.get(key) ? [[key, search.get(key)]] : []));
  return okJson(await listManagedCommunityWorks(getDb(), { ...input, tagId, tagState: search.get('tagState') ?? 'missing' }), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET = withApiErrors(get);
