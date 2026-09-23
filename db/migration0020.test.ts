/**
 * 迁移 0020（R15-02）：通知表、建议标签、标签图标与精选。
 * 在 PGlite 上验证三件事：全新库从 0000 升到 0020；带存量数据从 0019 升到 0020 时默认值正确、
 * 旧数据不变；down 文件回滚后日志回到 0019，且可以再次升级。
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const migrationsFolder = resolve(process.cwd(), 'db/migrations');
const TAG = '0020_discovery_notifications';
const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as {
  entries: Array<{ idx: number; tag: string; when: number }>;
};
const temporary: string[] = [];

/** 只含到某个迁移为止的迁移目录（模拟已部署到 0019 的数据库）。 */
function folderUntil(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'beadhue-migrations-'));
  temporary.push(dir);
  mkdirSync(join(dir, 'meta'));
  const entries = journal.entries.slice(0, journal.entries.findIndex((entry) => entry.tag === tag) + 1);
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) cpSync(join(migrationsFolder, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  return dir;
}

async function scalar<T>(client: PGlite, query: string, params: unknown[] = []): Promise<T> {
  const result = await client.query<Record<string, T>>(query, params);
  return Object.values(result.rows[0] ?? {})[0] as T;
}

async function columns(client: PGlite, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    'select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by column_name',
    ['public', table],
  );
  return result.rows.map((row) => row.column_name);
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('迁移 0020', () => {
  it('journal 最后一项就是 0020，且 down 文件删除的正是它的时间戳', () => {
    const last = journal.entries.at(-1)!;
    expect(last).toMatchObject({ idx: 20, tag: TAG });
    const down = readFileSync(join(migrationsFolder, 'down', `${TAG}.down.sql`), 'utf8');
    expect(down).toContain(`created_at = ${last.when}`);
  });

  it('全新库从 0000 一路升到 0020：新表、新列与两条索引都在', async () => {
    const client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(journal.entries.length);
    expect(await columns(client, 'notifications')).toEqual(['created_at', 'id', 'payload', 'read_at', 'type', 'user_id']);
    expect(await columns(client, 'community_tags')).toEqual(expect.arrayContaining(['icon', 'featured', 'sort_order']));
    expect(await columns(client, 'community_revisions')).toContain('suggested_tags');
    const indexes = await client.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where tablename = 'notifications' order by indexname",
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(['notifications_pkey', 'notifications_user_created_idx', 'notifications_user_unread_idx']);
    expect(indexes.rows.find((row) => row.indexname === 'notifications_user_unread_idx')?.indexdef).toContain('read_at IS NULL');
    await client.close();
  });

  it('带存量数据从 0019 升到 0020，down 回滚后可再次升级', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folderUntil('0019_ops_observability') });
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(20);

    const userId = await scalar<string>(client, "insert into users(email, email_verified_at) values ('m0020@example.test', now()) returning id");
    const tagId = await scalar<string>(client, "insert into community_tags(name, slug, sort_order) values ('星星人', 'stars', 3) returning id");
    const workId = await scalar<string>(client, 'insert into community_works(author_user_id) values ($1) returning id', [userId]);
    const revisionId = await scalar<string>(client, `insert into community_revisions(
      work_id, revision_number, title, author_type, public_author_id, frozen_display_name, license_version,
      license_confirmed_at, engine_version, board_profile, palette_kind, width, height, color_count, snapshot, preview
    ) values ($1, 1, '升级前作品', 'user', 'pa', '小豆', 'v1', now(), 'e', '5mm-29', 'builtin', 1, 1, 1, '{}'::jsonb, '{}'::jsonb) returning id`, [workId]);

    await migrate(db, { migrationsFolder });
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(21);
    const tag = (await client.query<{ name: string; sort_order: number; icon: string | null; featured: boolean }>(
      'select name, sort_order, icon, featured from community_tags where id = $1', [tagId],
    )).rows[0];
    expect(tag).toEqual({ name: '星星人', sort_order: 3, icon: null, featured: false });
    const revision = (await client.query<{ title: string; suggested_tags: string[] }>(
      'select title, suggested_tags from community_revisions where id = $1', [revisionId],
    )).rows[0];
    expect(revision).toEqual({ title: '升级前作品', suggested_tags: [] });

    // 新功能写入数据后执行 down：通知与新列一并移除，旧数据原样保留。
    await client.query("update community_revisions set suggested_tags = array['猫咪'] where id = $1", [revisionId]);
    await client.query("update community_tags set icon = 'star', featured = true where id = $1", [tagId]);
    await client.query("insert into notifications(user_id, type, payload) values ($1, 'revision_approved', '{}'::jsonb)", [userId]);
    await client.exec(readFileSync(join(migrationsFolder, 'down', `${TAG}.down.sql`), 'utf8'));
    expect(await scalar<string | null>(client, "select to_regclass('public.notifications')::text")).toBeNull();
    expect(await columns(client, 'community_tags')).not.toContain('icon');
    expect(await columns(client, 'community_tags')).not.toContain('featured');
    expect(await columns(client, 'community_revisions')).not.toContain('suggested_tags');
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(20);
    expect(await scalar<string>(client, 'select title from community_revisions where id = $1', [revisionId])).toBe('升级前作品');
    expect(await scalar<number>(client, 'select sort_order from community_tags where id = $1', [tagId])).toBe(3);

    await migrate(db, { migrationsFolder });
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(21);
    expect(await scalar<string[]>(client, 'select suggested_tags from community_revisions where id = $1', [revisionId])).toEqual([]);
    expect(await scalar<boolean>(client, 'select featured from community_tags where id = $1', [tagId])).toBe(false);
    expect(await scalar<string>(client, "select to_regclass('public.notifications')::text")).toBe('notifications');
    await client.close();
  });
});
