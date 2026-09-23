/**
 * GET /api/config：站点公开配置（票 02）。
 * 仅返回客户端可见、无敏感信息的子集（生成/导出默认参数）；
 * 安全阈值等敏感项绝不在此下发。
 * 公开接口，无需登录；禁用缓存头由 Next 默认处理（动态路由）。
 * 每个页面加载会拉取一次，此前完全不计数：补每 IP 小时限流（admin-round-3 12）。
 */
import { getDb } from '@/lib/auth/db';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { config, publicConfig } from '@/lib/config';
import { enforcePublicIpLimit } from '@/lib/security/publicRateLimit';

async function get(request: Request) {
  await enforcePublicIpLimit(getDb(), request, 'config', config.security.configRateLimit);
  return okJson(publicConfig());
}

export const GET = withApiErrors(get);
