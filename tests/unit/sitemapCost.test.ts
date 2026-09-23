/**
 * robots / sitemap 成本（admin-round-3 12）：
 * - 计数走 `count(*)` 聚合，不再把全部匹配行取回内存取 `.length`；
 * - 计数与分页结果有进程内短缓存，爬虫反复抓取不再每次都打库；
 * - Next 16 把 sitemap 的 id 作为 Promise 传入，页码解析必须能还原它
 *   （此前 `Number.isInteger(Promise)` 恒为 false，每一页都渲染成第 0 页）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnyDatabase } from '@/../db/client';
import { countSitemapWorks, listSitemapWorks, resetSitemapCache } from '@/lib/community/sitemapWorks';
import { config } from '@/lib/config';
import { normalizeSitemapId } from '@/app/sitemap';

/** count(*) 的最小桩：只认 `select(...).from().innerJoin().where()` 这条链。 */
function countStub(count: number) {
  const selects: unknown[] = [];
  const db = {
    select: (fields: unknown) => {
      selects.push(fields);
      return { from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ count }]) }) }) };
    },
  };
  return { db: db as unknown as AnyDatabase, selects };
}

/** 分页列表的最小桩：链条到 offset() 结束。 */
function listStub(rows: Array<{ id: string; updatedAt: Date }>) {
  const selects: unknown[] = [];
  const chain = {
    orderBy: () => chain,
    limit: () => chain,
    offset: () => Promise.resolve(rows),
  };
  const db = {
    select: (fields: unknown) => {
      selects.push(fields);
      return { from: () => ({ innerJoin: () => ({ where: () => chain }) }) };
    },
  };
  return { db: db as unknown as AnyDatabase, selects };
}

/** 取出 drizzle select 字段里的 SQL 文本（StringChunk.value 是字符串数组）。 */
function sqlTextOf(fields: unknown): string {
  const value = Object.values(fields as Record<string, { queryChunks?: Array<{ value?: string[] }> }>)[0];
  return (value?.queryChunks ?? []).flatMap((chunk) => chunk.value ?? []).join('');
}

const now = new Date('2026-09-11T08:00:00.000Z');

beforeEach(() => {
  resetSitemapCache();
});

describe('sitemap 计数与输出缓存', () => {
  it('用 count(*) 聚合而不是取回全部行', async () => {
    const { db, selects } = countStub(7);
    expect(await countSitemapWorks(db, now)).toBe(7);
    expect(sqlTextOf(selects[0])).toContain('count(*)');
  });

  it('TTL 内重复调用命中进程缓存，不再打库；跨 TTL 桶后重新读取', async () => {
    expect(config.security.sitemapCacheSeconds).toBeGreaterThan(0);
    const { db, selects } = countStub(3);
    expect(await countSitemapWorks(db, now)).toBe(3);
    expect(await countSitemapWorks(db, now)).toBe(3);
    expect(selects).toHaveLength(1);

    const laterBucket = new Date(now.getTime() + (config.security.sitemapCacheSeconds + 60) * 1000);
    expect(await countSitemapWorks(db, laterBucket)).toBe(3);
    expect(selects).toHaveLength(2);
  });

  it('分页列表同样带缓存，且按页号分键', async () => {
    const rows = [{ id: 'w1', updatedAt: now }];
    const { db, selects } = listStub(rows);
    expect(await listSitemapWorks(db, 0, now)).toEqual(rows);
    expect(await listSitemapWorks(db, 0, now)).toEqual(rows);
    expect(selects).toHaveLength(1);
    expect(await listSitemapWorks(db, 1, now)).toEqual(rows);
    expect(selects).toHaveLength(2);
  });
});

describe('sitemap 页码解析（Next 16 的 id 是 Promise<string>）', () => {
  it('字符串、数字、带 .xml 后缀都能解析，非法值回退第 0 页', () => {
    expect(normalizeSitemapId('3')).toBe(3);
    expect(normalizeSitemapId('0.xml')).toBe(0);
    expect(normalizeSitemapId(2)).toBe(2);
    expect(normalizeSitemapId(undefined)).toBe(0);
    expect(normalizeSitemapId('abc')).toBe(0);
    expect(normalizeSitemapId('-1')).toBe(0);
  });
});
