/**
 * 请求日志上下文（用户第 15 条「运行日志」）。
 *
 * 三个职责，全部是纯函数或 AsyncLocalStorage，不碰数据库：
 * - `withLogContext` / `currentLogContext` / `pushSpan`：把 requestId、账号、掩码 IP 与
 *   「调用链」挂在一次请求的异步上下文里，供慢查询与错误日志取用；
 * - `maskIp`：入库前把网络地址掩码（IPv4 末段清零，IPv6 只留前 48 位）；
 * - `redact`：持久化前剥掉禁止落库的字段（请求体、评论正文、邮箱、令牌、图纸/快照内容）。
 *
 * 这里刻意不 import 任何认证/数据库模块：`src/lib/auth/http.ts`、`src/lib/auth/dal.ts`
 * 与写入器都依赖本模块，保持叶子节点才能避免循环导入。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogSpanKind = 'route' | 'service' | 'db';

/** 调用链上的一环：route = 路由入口，service = 领域服务，db = 具体语句。 */
export interface LogSpan {
  kind: LogSpanKind;
  name: string;
  detail?: string;
}

export interface LogContext {
  requestId: string;
  actorUserId?: string;
  actorRole?: string;
  /** 已掩码的网络地址（maskIp 的输出），绝不存原始 IP。 */
  ipMasked: string;
  method: string;
  path: string;
  route: string;
  spans: LogSpan[];
}

/** 调用链上限：异常情况下（递归、循环调用）不能让 jsonb 无限膨胀。 */
const MAX_SPANS = 24;

const storage = new AsyncLocalStorage<LogContext>();

/**
 * 在给定上下文里执行 `fn`：路由最外层（withApiErrors）调用一次，
 * 之后所有嵌套的 await / 回调都能通过 `currentLogContext()` 读到同一份上下文。
 */
export function withLogContext<T>(context: Partial<LogContext> & { requestId: string }, fn: () => T): T {
  const store: LogContext = {
    requestId: context.requestId,
    actorUserId: context.actorUserId,
    actorRole: context.actorRole,
    ipMasked: context.ipMasked ?? 'unknown',
    method: context.method ?? '',
    path: context.path ?? '',
    route: context.route ?? '',
    spans: context.spans ? [...context.spans] : [],
  };
  return storage.run(store, fn);
}

/** 当前请求上下文；不在请求内（后台任务、启动钩子）时返回 undefined。 */
export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * 追加一环调用链。紧邻的同类型同名 span 只保留一条（递归/重试不会刷屏），
 * 超过上限后静默丢弃——调用链是诊断辅助，绝不因为它失败而影响主流程。
 */
export function pushSpan(span: LogSpan): void {
  const context = storage.getStore();
  if (!context) return;
  const last = context.spans[context.spans.length - 1];
  if (last && last.kind === span.kind && last.name === span.name) {
    if (span.detail) last.detail = span.detail;
    return;
  }
  if (context.spans.length >= MAX_SPANS) return;
  context.spans.push(span.detail === undefined ? { kind: span.kind, name: span.name } : { ...span });
}

/**
 * 把已鉴权账号写进当前上下文（`requireApiActor` 成功后调用）。
 * 没有上下文时是空操作：后台任务/测试里调用它不应报错。
 */
export function setLogActor(actor: { userId: string; role: string } | null | undefined): void {
  const context = storage.getStore();
  if (!context || !actor) return;
  context.actorUserId = actor.userId;
  context.actorRole = actor.role;
}

/** 调用链快照（浅拷贝），供写入器落库。 */
export function currentSpans(): LogSpan[] {
  const context = storage.getStore();
  return context ? context.spans.map((span) => ({ ...span })) : [];
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/;

function isValidOctet(value: string): boolean {
  return Number(value) <= 255;
}

/** IPv4 → 末段清零（`203.0.113.42` → `203.0.113.0`）。 */
function maskIpv4(input: string): string | null {
  const match = IPV4.exec(input);
  if (!match) return null;
  const octets = match.slice(1);
  if (!octets.every(isValidOctet)) return null;
  return `${Number(octets[0])}.${Number(octets[1])}.${Number(octets[2])}.0`;
}

/**
 * IPv6 → 只保留前 48 位（前 3 组），其余全部清零；输出压缩写法（`2001:db8:85a3::`）。
 * `::ffff:192.0.2.7` 这类内嵌 IPv4 的写法按内嵌地址掩码，否则等于把整个 IPv4 原样存下。
 */
function maskIpv6(input: string): string | null {
  const withoutZone = input.split('%')[0];
  const halves = withoutZone.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups: string[] = [...left];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2) {
    if (missing < 1) return null;
    for (let index = 0; index < missing; index += 1) groups.push('0');
  } else if (missing !== 0) {
    return null;
  }
  groups.push(...right);
  if (groups.length !== 8) return null;

  // 末尾仍写成点分十进制时（::ffff:192.0.2.7）先处理掉再算掩码。
  const tail = groups[7];
  if (tail.includes('.')) {
    const masked = maskIpv4(tail);
    const head = groups.slice(0, 7);
    if (!masked || !head.every((group) => HEX_GROUP.test(group))) return null;
    // ::ffff:a.b.c.d 是 IPv4 映射写法：保留映射前缀才认得出这是同一批地址。
    const mapped = Number.parseInt(head[6], 16) === 0xffff && head.slice(0, 6).every((group) => Number.parseInt(group, 16) === 0);
    if (mapped) return `::ffff:${masked}`;
    // 其余（如废弃的 ::192.0.2.7）：按通用规则处理，末两组本就在前 48 位之外。
    groups[6] = '0';
    groups[7] = '0';
  }
  if (!groups.every((group) => HEX_GROUP.test(group))) return null;
  const kept = groups.slice(0, 3).map((group) => Number.parseInt(group, 16).toString(16));
  return kept.every((group) => group === '0') ? '::' : `${kept.join(':')}::`;
}

/**
 * 网络地址掩码（写入数据库前必过）：
 * - IPv4：末段清零；
 * - IPv6：保留前 48 位，后 80 位清零；
 * - 字面量 `local`（无反代头，例如本机直连/内部调用）原样保留，它本身就不是地址；
 * - 无法识别：返回 `unknown`，绝不把原始字符串当地址存下来。
 */
export function maskIp(ip: string | null | undefined): string {
  const raw = (ip ?? '').trim().replace(/^\[|\]$/g, '');
  if (!raw) return 'unknown';
  if (raw === 'local') return 'local';
  if (raw.includes(':')) return maskIpv6(raw) ?? 'unknown';
  return maskIpv4(raw) ?? 'unknown';
}

/** 脱敏占位符：落库的是「这里有值但被拿掉了」，不是空白。 */
export const REDACTED = '[已脱敏]';

/**
 * 禁止持久化的键名（归一化后比较：去掉 `-` `_`、转小写）。
 * 覆盖需求里点名的五类：请求体、评论正文、邮箱、令牌、图纸/快照内容。
 */
const FORBIDDEN_KEYS = new Set([
  'body', 'requestbody', 'responsebody', 'rawbody', 'payload', 'formdata', 'multipart',
  'password', 'passwd', 'passwordhash', 'oldpassword', 'newpassword',
  'token', 'tokenhash', 'accesstoken', 'refreshtoken', 'resettoken', 'verifytoken', 'verificationcode', 'otp',
  'secret', 'apikey', 'authorization', 'cookie', 'setcookie', 'session', 'sessionid', 'sessiontoken', 'credential', 'credentials',
  'email', 'emailaddress', 'mail', 'recipient',
  'comment', 'commenttext', 'commentbody', 'text', 'plaintext', 'content', 'bodytext',
  'snapshot', 'pattern', 'patterndata', 'preview', 'canvas', 'pixels', 'image', 'imagedata', 'filedata', 'file', 'base64',
]);

/** 键名里出现这些片段也一律脱敏（`authorizationHeader` / `userEmail` / `patternSnapshot`…）。 */
const FORBIDDEN_KEY_PARTS = ['token', 'secret', 'password', 'passwd', 'credential', 'apikey', 'authorization', 'cookie', 'email', 'comment'];

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_\s]/g, '');

function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return FORBIDDEN_KEYS.has(normalized) || FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part));
}

const MAX_DEPTH = 6;
const MAX_KEYS = 60;
const MAX_ITEMS = 50;
const MAX_STRING = 512;

/**
 * 递归脱敏：只保留可以安全落库的标量。
 * 深度 / 键数 / 数组长度 / 单串长度都设上限——日志上下文是诊断辅助，不是数据副本。
 */
export function redact(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…` : input;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input === 'boolean') return input;
  if (typeof input === 'bigint') return input.toString();
  if (typeof input === 'function' || typeof input === 'symbol') return REDACTED;
  if (input instanceof Date) return input.toISOString();
  if (input instanceof Error) return { name: input.name, message: redact(input.message), code: redactErrorCode(input) };
  if (depth >= MAX_DEPTH) return REDACTED;

  if (Array.isArray(input)) {
    const items = input.slice(0, MAX_ITEMS).map((item) => redact(item, depth + 1));
    if (input.length > MAX_ITEMS) items.push(REDACTED);
    return items;
  }
  if (typeof input === 'object') {
    const output: Record<string, unknown> = {};
    let count = 0;
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (count >= MAX_KEYS) break;
      count += 1;
      output[key] = isForbiddenKey(key) ? REDACTED : redact(value, depth + 1);
    }
    return output;
  }
  return REDACTED;
}

function redactErrorCode(error: Error): string | null {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.slice(0, 64) : null;
}
