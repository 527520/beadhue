/** 应用错误（spec §4.2 错误约定）。 */

export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ACCOUNT_SUSPENDED'
  | 'STATE_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'COMMENTS_LOCKED'
  | 'COMMENT_BLOCKED'
  | 'ORIGINAL_REQUIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'REVISION_CONFLICT'
  | 'RATE_LIMITED'
  | 'MAIL_UNAVAILABLE'
  | 'INTERNAL';

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ACCOUNT_SUSPENDED: 403,
  STATE_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  COMMENTS_LOCKED: 409,
  COMMENT_BLOCKED: 422,
  ORIGINAL_REQUIRED: 409,
  PAYLOAD_TOO_LARGE: 413,
  REVISION_CONFLICT: 409,
  RATE_LIMITED: 429,
  MAIL_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** 携带可安全返回给前端的错误码与字段路径；绝不包含堆栈/内部细节。 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** zod 字段路径或业务字段名，用于 UI 定位。 */
  readonly field?: string;
  /**
   * 限流响应建议的等待秒数。缺省时 apiError 按小时窗口给（多数限流都是小时桶）；
   * 登录临时锁定等短窗口要显式传，否则客户端会被告知等一小时。
   */
  readonly retryAfterSeconds?: number;

  constructor(code: AppErrorCode, message: string, field?: string, options: { retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.field = field;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** API 统一错误响应体。 */
export interface ApiErrorBody {
  error: { code: AppErrorCode; message: string; field?: string };
  requestId: string;
}
