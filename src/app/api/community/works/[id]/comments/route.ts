import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { createCommunityComment, listCommunityComments } from '@/lib/community/interactions';
import { clientIp } from '@/lib/auth/rateLimit';
import { getSessionActor } from '@/lib/auth/session';
import { enforceAccountReadQuota } from '@/lib/security/accountReadQuota';
import { enforcePublicReadLimit } from '@/lib/security/publicRateLimit';

const schema = z.object({ body: z.string() }).strict();

async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workId = z.string().uuid().parse((await params).id);
  await enforcePublicReadLimit(getDb(), request, 'comments');
  const actor = await getSessionActor({ renew: true });
  // 评论列表带作品上下文：登录后同样计账号配额与「每小时不同作品数」。
  if (actor) {
    await enforceAccountReadQuota(getDb(), { userId: actor.userId, accountCreatedAt: actor.accountCreatedAt, workIds: [workId] });
  }
  const cursor = new URL(request.url).searchParams.get('cursor');
  return okJson(await listCommunityComments(getDb(), workId, actor?.userId, { cursor }));
}

async function post(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:interact');
  const workId = z.string().uuid().parse((await params).id);
  const body = await readJson(request, 4 * 1024);
  if (!body.ok) return body.response;
  const input = schema.parse(body.data);
  const comment = await createCommunityComment(getDb(), { actor, workId, body: input.body, ip: clientIp(request) });
  return okJson({ id: comment.id, status: comment.status, version: comment.version }, { status: 201 });
}

export const GET = withApiErrors(get);
export const POST = withApiErrors(post);
