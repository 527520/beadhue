/**
 * 后台按值查表的中文映射必须覆盖服务端可能写出的每个值：审计页、评论治理页找不到时会直接显示英文代码。
 * 这些键只在运行时按变量取用，静态扫描找不到引用，清理「无引用文案」时最容易被误删。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zhCN } from '@/messages/zh-CN';

const AUDIT_WRITERS = [
  'src/lib/admin/audit.ts', 'src/lib/admin/userGovernance.ts', 'src/lib/auth/accountLifecycle.ts', 'src/lib/community/service.ts',
  'src/lib/community/adminService.ts', 'src/lib/community/interactions.ts', 'src/lib/community/officialBatch.ts',
];
/** 按模板拼出的动作，取值与源码里的联合类型一致（adminService / interactions / officialBatch）。 */
const TEMPLATED = [
  ...['remove', 'restore', 'feature', 'unfeature', 'lock_comments', 'unlock_comments'].map((action) => `community.work_${action}`),
  ...['published', 'hidden'].map((decision) => `community.comment_${decision}`),
  ...['accepted', 'resolved', 'dismissed'].map((decision) => `community.report_${decision}`),
  ...['pause', 'resume', 'cancel', 'finish'].map((action) => `official.batch_${action}`),
];
/** 腾讯云文本内容安全会返回的恶意标签（Normal 表示正常）。 */
const TMS_LABELS = ['Normal', 'Porn', 'Abuse', 'Ad', 'Illegal', 'Terror', 'Polity', 'Teenager'];

describe('后台映射表覆盖服务端取值', () => {
  const audit = zhCN.communityAdmin.audit;

  it('写入审计日志的每个动作都有中文名', () => {
    const literals = AUDIT_WRITERS.flatMap((file) => [...readFileSync(join(process.cwd(), file), 'utf8')
      .matchAll(/'((?:community|official|user|account|moderation)\.[a-z_]+)'/g)].map((match) => match[1]));
    expect(literals.length).toBeGreaterThan(5);
    const missing = [...new Set([...literals, ...TEMPLATED])].filter((action) => !(action in audit.actions));
    expect(missing).toEqual([]);
  });

  it('审计对象类型与内容安全标签都有中文名', () => {
    const targets = AUDIT_WRITERS.flatMap((file) => [...readFileSync(join(process.cwd(), file), 'utf8')
      .matchAll(/targetType: '([a-z_]+)',/g)].map((match) => match[1]));
    expect([...new Set(targets)].filter((type) => !(type in audit.targets))).toEqual([]);
    expect(TMS_LABELS.filter((label) => !(label in zhCN.communityAdmin.moderationCheck.labels))).toEqual([]);
  });
});
