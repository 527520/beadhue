import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listGovernanceReports } from '@/lib/community/interactions';

async function get(request: Request) {
  await requireApiActor('community:moderate');
  const search = new URL(request.url).searchParams;
  const input = Object.fromEntries(['page', 'size', 'status', 'targetType'].flatMap((key) => search.get(key) ? [[key, search.get(key)]] : []));
  return okJson(await listGovernanceReports(getDb(), input), { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
