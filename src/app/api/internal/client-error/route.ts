/**
 * POST /api/internal/client-error：浏览器端错误边界上报（用户第 15 条）。
 *
 * 只接受四个字段（message / digest / path / stack），其余一律由服务端补：
 * 掩码 IP、requestId、时间。用户在浏览器里能伪造这四个字段，但它们只是文本，
 * 写入前会被截断，且每 IP 每小时 60 次上限——伪造的代价大于收益。
 *
 * 刻意不接受 user-agent、referer 或任何自定义字段：上报接口越窄，越不容易变成
 * 「往日志表里塞任意内容」的入口。
 */
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { getDb } from '@/lib/auth/db';
import { apiError, noContent, readJson, withApiErrors } from '@/lib/auth/http';
import { checkRateLimit, clientIp } from '@/lib/auth/rateLimit';
import { config } from '@/lib/config';
import { maskIp } from '@/lib/observability/context';
import { writeSystemLog } from '@/lib/observability/log';

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  digest: z.string().trim().max(120).optional(),
  path: z.string().trim().max(300).optional(),
  stack: z.string().max(16_000).optional(),
}).strict();

async function post(request: Request) {
  const db = getDb();
  const ip = clientIp(request);
  const allowed = await checkRateLimit(db, `internal:client-error:${ip}`, config.observability.clientErrorRateLimit);
  if (!allowed) return apiError(new AppError('RATE_LIMITED', '请求过于频繁'));

  const body = await readJson(request, 24 * 1024);
  if (!body.ok) return body.response;
  const parsed = clientErrorSchema.safeParse(body.data);
  if (!parsed.success) return apiError(parsed.error);

  // 等待落库再返回：这是错误边界，调用方本来就在等；写失败也只在 stdout 留痕。
  await writeSystemLog(db, {
    level: 'error',
    source: 'client',
    event: 'client.error',
    ipMasked: maskIp(ip),
    path: parsed.data.path ?? null,
    errorCode: parsed.data.digest ?? null,
    message: parsed.data.message,
    stack: parsed.data.stack ?? null,
  });
  return noContent();
}

export const POST = withApiErrors(post);
