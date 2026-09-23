/**
 * 站点配置（优化票 02，决策 D32）：所有「改配置即生效」参数的单一出口。
 *
 * - 服务端（Node 运行时）读取环境变量；浏览器端无 process.env → 回退默认值。
 * - 客户端可见的公开子集经 GET /api/config 下发（服务端运行时值），
 *   由 usePublicConfig() 消费：改 .env + 重启容器即生效，无需改代码重新发版。
 * - 值非法（非整数/越界）时回退默认值并在服务端告警。
 * - 敏感项（限流/会话/体积）绝不出现在 publicConfig() 中。
 */
import { LIMITS } from '@/lib/appInfo';
import { A4_HEIGHT_MM, A4_WIDTH_MM } from '@/lib/paper';

const isServer = typeof process !== 'undefined' && process.versions?.node != null;

function readInt(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!isServer) return fallback;
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.warn(`[config] 环境变量 ${name}=${raw} 非法，回退默认 ${fallback}`);
    return fallback;
  }
  return value;
}

function readBool(name: string, fallback: boolean): boolean {
  if (!isServer) return fallback;
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/** 客户端可见配置（经 /api/config 下发）。 */
export interface PublicConfig {
  generation: {
    /** 生成默认目标宽度（格） */
    defaultWidth: number;
    /** 生成默认颜色数 */
    defaultColorCount: number;
  };
  exportPng: {
    /** PNG 每格像素 */
    cellPx: number;
    /** 是否裁剪至内容 */
    cropToContent: boolean;
    /** 是否包含图例 */
    includeLegend: boolean;
  };
  exportPdf: {
    /** 每格毫米 */
    cellMm: number;
    /** 页边距毫米 */
    marginMm: number;
    /** 页眉高度毫米 */
    headerMm: number;
    /** 每页列数 */
    pageCols: number;
    /** 每页行数 */
    pageRows: number;
  };
}

export interface SiteConfig extends PublicConfig {
  security: {
    loginRateLimit: number;
    registerRateLimit: number;
    tokenRateLimit: number;
    /** 同步写（设计/色板 PUT+DELETE）每用户每小时上限 */
    syncWriteRateLimit: number;
    /** 备份告警端点每 IP 每小时上限 */
    backupAlertRateLimit: number;
    /** 匿名分析摄取每个短期 IP HMAC 键每小时上限 */
    analyticsRateLimit: number;
    /** 豆社公开读接口（列表 / 详情 / 评论 / 缩略图渲染）每 IP 每小时上限 */
    publicReadRateLimit: number;
    /** 豆社公开 HTML 页面（列表 / 详情 / sitemap）每 IP 每分钟上限（进程内计数） */
    publicPageRatePerMinute: number;
    /** 豆社写操作（点赞 / 举报 / 引用 / 投稿 / 原图上传 / 删评）每账号每小时上限 */
    communityWriteRateLimit: number;
    /** 豆社写操作每 IP 每小时上限 */
    communityWriteIpRateLimit: number;
    /** 管理端缩略图每个管理员每小时上限（兜底，远高于后台实际用量） */
    adminThumbnailRateLimit: number;
    /** 管理端官方原图上传每个管理员每小时上限（50 张批次 + 重试留足额度） */
    adminOriginalRateLimit: number;
    /** sitemap 只列最近 N 天更新的作品 */
    sitemapRecentDays: number;
    /** sitemap 每页作品数 */
    sitemapPageSize: number;
    /** robots / sitemap 输出（计数与分页列表）的进程内缓存秒数 */
    sitemapCacheSeconds: number;
    /** robots / sitemap 响应对共享缓存（CDN）声明的 s-maxage 秒数（由 proxy 下发） */
    sitemapHttpSMaxAge: number;
    /** 缩略图进程内缓存的条数上限 */
    thumbnailCacheEntries: number;
    /** 缩略图进程内缓存的字节上限 */
    thumbnailCacheBytes: number;
    /** 原图 GET 每账号每小时上限 */
    originalReadRateLimit: number;
    /** 原图 GET 每 IP 每小时上限 */
    originalReadIpRateLimit: number;
    /** 原图字节缓存上限（进程内 LRU，按 cosKey） */
    originalCacheBytes: number;
    /** 公开读接口每账号每小时上限（登录后仍可被爬，需按账号兜底） */
    accountReadRateLimit: number;
    /** 公开读接口每账号每小时不同作品数上限 */
    accountReadDistinctWorks: number;
    /** 新账号（注册未满 newAccountAgeHours）每小时读取上限 */
    newAccountReadRateLimit: number;
    /** 新账号每小时不同作品数上限 */
    newAccountReadDistinctWorks: number;
    /** 「新账号」判定窗口（小时） */
    newAccountAgeHours: number;
    /** 登录失败计数窗口（分钟） */
    loginFailureWindowMinutes: number;
    /** 登录失败达到该次数即临时锁定（按邮箱） */
    loginFailureThreshold: number;
    /** 登录锁定时长（分钟） */
    loginLockMinutes: number;
    /** 邮件预算：新账号 / 未验证账号桶每日上限 */
    mailNewAccountDailyLimit: number;
    /** 邮件预算：已建立账号桶每日上限 */
    mailEstablishedDailyLimit: number;
    /** 邮件预算：已建立账号的最小注册天数（已验证 + 满该天数） */
    mailEstablishedMinAgeDays: number;
    /** GET /api/community/tags 每 IP 每小时上限 */
    tagsRateLimit: number;
    /** GET /api/config 每 IP 每小时上限 */
    configRateLimit: number;
    /** PUT /api/analytics/consent 每 IP 每小时上限 */
    consentRateLimit: number;
    sessionTtlSeconds: number;
    maxBodyBytes: number;
  };
  /** 生产连接池韧性：任一项为 0 表示不设该超时（不推荐）。 */
  database: {
    poolMax: number;
    statementTimeoutMs: number;
    connectionTimeoutMs: number;
    idleTimeoutMs: number;
  };
  /**
   * 运行可观测（用户第 15 条）：自建日志 / 慢查询 / 连接池信息。
   * 全部为「改环境变量即生效」的参数，语义与 RATE_* / DB_* 一致。
   */
  observability: {
    /** 慢查询阈值（毫秒）；显式设为 0 表示停用慢查询采集 */
    slowQueryMs: number;
    /** 每进程每分钟最多写入的 system_logs 行数（超出后按分钟汇总一条抑制说明） */
    syslogMaxRowsPerMinute: number;
    /** system_logs 保留天数（错误与事件） */
    syslogRetentionDays: number;
    /** slow_queries 保留天数 */
    slowQueryRetentionDays: number;
    /** 浏览器端错误上报每 IP 每小时上限（防伪造刷量） */
    clientErrorRateLimit: number;
  };
  /** 评论审核（D50）：反刷闸门与腾讯云文本内容安全的成本护栏。 */
  moderation: {
    /** 每个账号每小时最多发表评论次数 */
    commentsPerUserPerHour: number;
    /** 每个账号每天最多发表评论次数 */
    commentsPerUserPerDay: number;
    /** 每个 IP 每小时最多发表评论次数（未知 IP 不计） */
    commentsPerIpPerHour: number;
    /** 全站每天最多调用内容安全接口次数；超出后新评论一律进待审 */
    tmsDailyBudget: number;
    /** 同文哈希结果缓存小时数；命中缓存不再计费 */
    tmsCacheHours: number;
    /** 单次调用超时毫秒 */
    tmsTimeoutMs: number;
  };
}

/** 默认值即历史行为：未配置任何环境变量时，站点行为与优化前完全一致。 */
const DEFAULTS: SiteConfig = {
  generation: { defaultWidth: 100, defaultColorCount: 40 },
  exportPng: { cellPx: 24, cropToContent: true, includeLegend: false },
  exportPdf: { cellMm: 6, marginMm: 8, headerMm: 10, pageCols: 31, pageRows: 45 },
  security: {
    loginRateLimit: 10,
    registerRateLimit: 10,
    tokenRateLimit: 60,
    syncWriteRateLimit: 600,
    backupAlertRateLimit: 60,
    analyticsRateLimit: 300,
    publicReadRateLimit: 1200,
    publicPageRatePerMinute: 120,
    communityWriteRateLimit: 120,
    communityWriteIpRateLimit: 300,
    adminThumbnailRateLimit: 20_000,
    adminOriginalRateLimit: 300,
    sitemapRecentDays: 180,
    sitemapPageSize: 500,
    // robots/sitemap 是爬虫最爱反复抓的入口：抓到的输出在进程内缓存 5 分钟，
    // 爬虫的重复抓取不再每次都打数据库（Next 元数据路由自身只发 max-age=0）。
    sitemapCacheSeconds: 300,
    // robots/sitemap 响应对共享缓存（CDN）声明的 s-maxage：Next 的元数据路由自己发
    // `public, max-age=0, must-revalidate`，无法在路由里覆盖，由 proxy 覆盖成 5 分钟。
    sitemapHttpSMaxAge: 300,
    // 512 条 ≈ 21 个列表页 × 24 张；64 MiB ≈ 1280 张 50 KB 的 PNG。
    thumbnailCacheEntries: 512,
    thumbnailCacheBytes: 64 * 1024 * 1024,
    // 原图单张上限 20 MB：60 次/时/账号 ≈ 1.2 GB/时，足够作者与引用者正常取回。
    originalReadRateLimit: 60,
    originalReadIpRateLimit: 200,
    originalCacheBytes: 32 * 1024 * 1024,
    // 人类浏览强度远低于此：1200 次/时 ≈ 每分钟 20 次接口调用。
    accountReadRateLimit: 1200,
    accountReadDistinctWorks: 300,
    // 注册不到 24 小时的账号只用于正常试用：收紧到 120 次/时、60 件作品/时。
    newAccountReadRateLimit: 120,
    newAccountReadDistinctWorks: 60,
    newAccountAgeHours: 24,
    loginFailureWindowMinutes: 15,
    loginFailureThreshold: 10,
    loginLockMinutes: 15,
    // 两个邮件桶：攻击者烧掉新账号桶不影响已建立账号的找回密码。
    mailNewAccountDailyLimit: 200,
    mailEstablishedDailyLimit: 100,
    mailEstablishedMinAgeDays: 7,
    // tags 响应本身带 s-maxage=300；config 每个页面加载只拉一次。
    tagsRateLimit: 600,
    configRateLimit: 1200,
    // 同意 / 撤回是低频操作，且必须始终可用：额度按「一小时内反复切换」给足。
    consentRateLimit: 60,
    sessionTtlSeconds: 30 * 24 * 60 * 60,
    maxBodyBytes: 64 * 1024,
  },
  database: {
    poolMax: 10,
    statementTimeoutMs: 15_000,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
  },
  moderation: {
    commentsPerUserPerHour: 20,
    commentsPerUserPerDay: 80,
    commentsPerIpPerHour: 60,
    tmsDailyBudget: 2000,
    tmsCacheHours: 24 * 7,
    tmsTimeoutMs: 3000,
  },
  observability: {
    // 500ms 是「人已经能感觉到」的门槛；再低会把正常查询也灌进慢查询表。
    slowQueryMs: 500,
    // 200 行/分钟 ≈ 3.3 行/秒：突发错误风暴下也不会把库写满，同时保留足够的现场。
    syslogMaxRowsPerMinute: 200,
    // 与隐私政策写明的「最长 30 天」保持一致（见 zh-CN 隐私政策第九节）。
    syslogRetentionDays: 30,
    slowQueryRetentionDays: 14,
    clientErrorRateLimit: 60,
  },
};

/** PDF 版式参数必须作为整组落在 A4 可见区内，否则整组回退。 */
export function normalizePdfMetrics(
  candidate: PublicConfig['exportPdf'],
  fallback: PublicConfig['exportPdf'],
): PublicConfig['exportPdf'] {
  const fieldsAreValid = Number.isFinite(candidate.cellMm)
    && Number.isFinite(candidate.marginMm)
    && Number.isFinite(candidate.headerMm)
    && candidate.cellMm > 0
    && candidate.marginMm > 0
    && candidate.headerMm > 0
    && Number.isInteger(candidate.pageCols)
    && Number.isInteger(candidate.pageRows)
    && candidate.pageCols > 0
    && candidate.pageRows > 0;
  // A4 尺寸常量与 export/pdfLayout.ts 共用（J-3：此前两处各自硬编码 210/297）。
  const fitsWidth = 2 * candidate.marginMm + candidate.pageCols * candidate.cellMm <= A4_WIDTH_MM;
  const fitsHeight = 2 * candidate.marginMm + candidate.headerMm + candidate.pageRows * candidate.cellMm <= A4_HEIGHT_MM;
  return { ...(fieldsAreValid && fitsWidth && fitsHeight ? candidate : fallback) };
}

function compute(): SiteConfig {
  const exportPdf = normalizePdfMetrics(
    {
      cellMm: readInt('PDF_CELL_MM', DEFAULTS.exportPdf.cellMm, 2, 20),
      marginMm: readInt('PDF_MARGIN_MM', DEFAULTS.exportPdf.marginMm, 2, 30),
      headerMm: readInt('PDF_HEADER_MM', DEFAULTS.exportPdf.headerMm, 4, 30),
      pageCols: readInt('PDF_PAGE_COLS', DEFAULTS.exportPdf.pageCols, 5, 100),
      pageRows: readInt('PDF_PAGE_ROWS', DEFAULTS.exportPdf.pageRows, 5, 100),
    },
    DEFAULTS.exportPdf,
  );
  return {
    generation: {
      defaultWidth: readInt('GEN_DEFAULT_WIDTH', DEFAULTS.generation.defaultWidth, LIMITS.targetWidth.min, LIMITS.targetWidth.max),
      defaultColorCount: readInt('GEN_DEFAULT_COLORS', DEFAULTS.generation.defaultColorCount, LIMITS.targetColorCount.min, LIMITS.targetColorCount.max),
    },
    exportPng: {
      cellPx: readInt('PNG_CELL_PX', DEFAULTS.exportPng.cellPx, 8, 48),
      cropToContent: readBool('PNG_CROP_TO_CONTENT', DEFAULTS.exportPng.cropToContent),
      includeLegend: readBool('PNG_INCLUDE_LEGEND', DEFAULTS.exportPng.includeLegend),
    },
    exportPdf,
    security: {
      loginRateLimit: readInt('RATE_LOGIN', DEFAULTS.security.loginRateLimit, 1),
      registerRateLimit: readInt('RATE_REGISTER', DEFAULTS.security.registerRateLimit, 1),
      tokenRateLimit: readInt('RATE_TOKEN', DEFAULTS.security.tokenRateLimit, 1),
      syncWriteRateLimit: readInt('RATE_SYNC_WRITE', DEFAULTS.security.syncWriteRateLimit, 1),
      backupAlertRateLimit: readInt('RATE_BACKUP_ALERT', DEFAULTS.security.backupAlertRateLimit, 1),
      analyticsRateLimit: readInt('RATE_ANALYTICS', DEFAULTS.security.analyticsRateLimit, 1),
      publicReadRateLimit: readInt('RATE_PUBLIC_READ_IP_HOUR', DEFAULTS.security.publicReadRateLimit, 1),
      publicPageRatePerMinute: readInt('RATE_PUBLIC_PAGE_IP_MINUTE', DEFAULTS.security.publicPageRatePerMinute, 1),
      communityWriteRateLimit: readInt('RATE_COMMUNITY_WRITE_USER_HOUR', DEFAULTS.security.communityWriteRateLimit, 1),
      communityWriteIpRateLimit: readInt('RATE_COMMUNITY_WRITE_IP_HOUR', DEFAULTS.security.communityWriteIpRateLimit, 1),
      adminThumbnailRateLimit: readInt('RATE_ADMIN_THUMBNAIL_USER_HOUR', DEFAULTS.security.adminThumbnailRateLimit, 1),
      adminOriginalRateLimit: readInt('RATE_ADMIN_ORIGINAL_USER_HOUR', DEFAULTS.security.adminOriginalRateLimit, 1),
      sitemapRecentDays: readInt('SITEMAP_RECENT_DAYS', DEFAULTS.security.sitemapRecentDays, 1, 3650),
      sitemapPageSize: readInt('SITEMAP_PAGE_SIZE', DEFAULTS.security.sitemapPageSize, 10, 5000),
      sitemapCacheSeconds: readInt('SITEMAP_CACHE_SECONDS', DEFAULTS.security.sitemapCacheSeconds, 0, 86_400),
      sitemapHttpSMaxAge: readInt('SITEMAP_HTTP_S_MAXAGE', DEFAULTS.security.sitemapHttpSMaxAge, 0, 86_400),
      thumbnailCacheEntries: readInt('THUMBNAIL_CACHE_ENTRIES', DEFAULTS.security.thumbnailCacheEntries, 1, 1_000_000),
      thumbnailCacheBytes: readInt('THUMBNAIL_CACHE_BYTES', DEFAULTS.security.thumbnailCacheBytes, 1024, 4 * 1024 * 1024 * 1024),
      originalReadRateLimit: readInt('RATE_ORIGINAL_READ_USER_HOUR', DEFAULTS.security.originalReadRateLimit, 1),
      originalReadIpRateLimit: readInt('RATE_ORIGINAL_READ_IP_HOUR', DEFAULTS.security.originalReadIpRateLimit, 1),
      originalCacheBytes: readInt('ORIGINAL_CACHE_BYTES', DEFAULTS.security.originalCacheBytes, 0, 4 * 1024 * 1024 * 1024),
      accountReadRateLimit: readInt('RATE_ACCOUNT_READ_USER_HOUR', DEFAULTS.security.accountReadRateLimit, 1),
      accountReadDistinctWorks: readInt('RATE_ACCOUNT_READ_DISTINCT_WORKS_HOUR', DEFAULTS.security.accountReadDistinctWorks, 1),
      newAccountReadRateLimit: readInt('RATE_NEW_ACCOUNT_READ_USER_HOUR', DEFAULTS.security.newAccountReadRateLimit, 1),
      newAccountReadDistinctWorks: readInt('RATE_NEW_ACCOUNT_READ_DISTINCT_WORKS_HOUR', DEFAULTS.security.newAccountReadDistinctWorks, 1),
      newAccountAgeHours: readInt('NEW_ACCOUNT_AGE_HOURS', DEFAULTS.security.newAccountAgeHours, 1, 24 * 30),
      loginFailureWindowMinutes: readInt('LOGIN_FAILURE_WINDOW_MINUTES', DEFAULTS.security.loginFailureWindowMinutes, 1, 24 * 60),
      loginFailureThreshold: readInt('LOGIN_FAILURE_THRESHOLD', DEFAULTS.security.loginFailureThreshold, 1),
      loginLockMinutes: readInt('LOGIN_LOCK_MINUTES', DEFAULTS.security.loginLockMinutes, 1, 24 * 60),
      // MAIL_DAILY_SEND_LIMIT 是历史变量名，现在专指「新账号 / 未验证账号」桶。
      mailNewAccountDailyLimit: readInt('MAIL_DAILY_SEND_LIMIT', DEFAULTS.security.mailNewAccountDailyLimit, 1),
      mailEstablishedDailyLimit: readInt('MAIL_ESTABLISHED_DAILY_LIMIT', DEFAULTS.security.mailEstablishedDailyLimit, 1),
      mailEstablishedMinAgeDays: readInt('MAIL_ESTABLISHED_MIN_AGE_DAYS', DEFAULTS.security.mailEstablishedMinAgeDays, 1, 3650),
      tagsRateLimit: readInt('RATE_TAGS_IP_HOUR', DEFAULTS.security.tagsRateLimit, 1),
      configRateLimit: readInt('RATE_CONFIG_IP_HOUR', DEFAULTS.security.configRateLimit, 1),
      consentRateLimit: readInt('RATE_CONSENT_IP_HOUR', DEFAULTS.security.consentRateLimit, 1),
      sessionTtlSeconds: readInt('SESSION_TTL_SECONDS', DEFAULTS.security.sessionTtlSeconds, 60),
      maxBodyBytes: readInt('MAX_BODY_BYTES', DEFAULTS.security.maxBodyBytes, 1024),
    },
    database: {
      poolMax: readInt('DB_POOL_MAX', DEFAULTS.database.poolMax, 1, 200),
      statementTimeoutMs: readInt('DB_STATEMENT_TIMEOUT_MS', DEFAULTS.database.statementTimeoutMs, 0, 600_000),
      connectionTimeoutMs: readInt('DB_CONNECTION_TIMEOUT_MS', DEFAULTS.database.connectionTimeoutMs, 0, 60_000),
      idleTimeoutMs: readInt('DB_IDLE_TIMEOUT_MS', DEFAULTS.database.idleTimeoutMs, 0, 600_000),
    },
    moderation: {
      commentsPerUserPerHour: readInt('RATE_COMMENT_USER_HOUR', DEFAULTS.moderation.commentsPerUserPerHour, 1),
      commentsPerUserPerDay: readInt('RATE_COMMENT_USER_DAY', DEFAULTS.moderation.commentsPerUserPerDay, 1),
      commentsPerIpPerHour: readInt('RATE_COMMENT_IP_HOUR', DEFAULTS.moderation.commentsPerIpPerHour, 1),
      tmsDailyBudget: readInt('TMS_DAILY_BUDGET', DEFAULTS.moderation.tmsDailyBudget, 0),
      tmsCacheHours: readInt('TMS_CACHE_HOURS', DEFAULTS.moderation.tmsCacheHours, 0, 24 * 90),
      tmsTimeoutMs: readInt('TMS_TIMEOUT_MS', DEFAULTS.moderation.tmsTimeoutMs, 500, 30_000),
    },
    observability: {
      slowQueryMs: readInt('SLOW_QUERY_MS', DEFAULTS.observability.slowQueryMs, 0, 600_000),
      syslogMaxRowsPerMinute: readInt('SYSLOG_MAX_ROWS_PER_MINUTE', DEFAULTS.observability.syslogMaxRowsPerMinute, 1, 100_000),
      syslogRetentionDays: readInt('SYSLOG_RETENTION_DAYS', DEFAULTS.observability.syslogRetentionDays, 1, 3650),
      slowQueryRetentionDays: readInt('SLOW_QUERY_RETENTION_DAYS', DEFAULTS.observability.slowQueryRetentionDays, 1, 3650),
      clientErrorRateLimit: readInt('RATE_CLIENT_ERROR_IP_HOUR', DEFAULTS.observability.clientErrorRateLimit, 1),
    },
  };
}

/** 模块级单例：服务端首次导入时固化（环境变量在进程启动时已定）。 */
export const config: SiteConfig = compute();

/**
 * 生产连接池选项（A-11）：无超时的池子在一条卡死语句下会耗尽 10 个连接，
 * 之后所有请求 hang 到 Node 超时 —— 表现为全站不可用而不是优雅 503。
 * 值为 0 时省略该项（交给 PostgreSQL 默认）。
 */
export function poolOptions(cfg: SiteConfig['database'] = config.database): {
  max: number;
  keepAlive: true;
  statement_timeout?: number;
  query_timeout?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
} {
  return {
    max: cfg.poolMax,
    keepAlive: true,
    ...(cfg.statementTimeoutMs > 0
      ? { statement_timeout: cfg.statementTimeoutMs, query_timeout: cfg.statementTimeoutMs }
      : {}),
    ...(cfg.connectionTimeoutMs > 0 ? { connectionTimeoutMillis: cfg.connectionTimeoutMs } : {}),
    ...(cfg.idleTimeoutMs > 0 ? { idleTimeoutMillis: cfg.idleTimeoutMs } : {}),
  };
}

/** 浏览器端初始回退（SSR/未加载 /api/config 前使用）。 */
export const publicConfigFallback: PublicConfig = {
  generation: { ...DEFAULTS.generation },
  exportPng: { ...DEFAULTS.exportPng },
  exportPdf: { ...DEFAULTS.exportPdf },
};

/** /api/config 返回的公开子集（服务端运行时值）。 */
export function publicConfig(): PublicConfig {
  return {
    generation: { ...config.generation },
    exportPng: { ...config.exportPng },
    exportPdf: { ...config.exportPdf },
  };
}
