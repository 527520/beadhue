/**
 * 后台不得直接调用豆社公开接口（admin-round-3 10 / ADR-0025）。
 *
 * 官方批次此前用公开缩略图与原图接口：50 张草稿会吃满「每 IP 每小时」的公开读配额与
 * 「每账号每小时」的公开写配额，于是后台被自己的反爬护栏限流。管理端改走
 * `/api/admin/community/revisions/:id/thumbnail|original` 之后，这条护栏防止它长回来。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function adminSources(): string[] {
  const files: string[] = [];
  for (const dir of ['src/components/admin', 'src/components/admin-ui', 'src/app/admin']) {
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) files.push(full);
      }
    };
    walk(join(process.cwd(), dir));
  }
  return files;
}

describe('后台接口作用域', () => {
  it('后台组件不出现豆社公开接口路径', () => {
    const offenders: string[] = [];
    for (const file of adminSources()) {
      const matches = readFileSync(file, 'utf8').match(/['"`]\/api\/community\//gu) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.length} 处`);
    }
    expect(offenders).toEqual([]);
  });

  it('管理端缩略图与原图地址只在管理端工具里出现', () => {
    const thumbnailUrl = readFileSync(join(process.cwd(), 'src', 'lib', 'community', 'thumbnailUrl.ts'), 'utf8');
    expect(thumbnailUrl).toContain('/api/admin/community/revisions/');
    const client = readFileSync(join(process.cwd(), 'src', 'lib', 'community', 'originalsClient.ts'), 'utf8');
    expect(client).toContain('/api/admin/community/revisions/');
  });
});
