import { AppError } from '@/lib/errors';
import { setLogActor } from '@/lib/observability/context';
import { authorize, type Actor, type Capability } from './authorization';
import { getSessionActor } from './session';

/** Authorization seam for Route Handlers and server-side data modules. */
export async function requireApiActor(capability: Capability): Promise<Actor> {
  const actor = await getSessionActor({ renew: true });
  if (!actor) throw new AppError('UNAUTHORIZED', '请先登录');
  if (!actor.emailVerified) throw new AppError('FORBIDDEN', '请先验证邮箱');
  if (!authorize(actor, capability)) throw new AppError('FORBIDDEN', '没有执行此操作的权限');
  // 运行日志（用户第 15 条）：把「哪个账号」写进当前请求上下文，
  // 之后这条请求里产生的错误与慢查询都自带 actor_user_id / actor_role。
  // observability/context 是叶子模块（只依赖 node:async_hooks），不构成循环导入。
  setLogActor(actor);
  return actor;
}
