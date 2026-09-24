/**
 * 迁移 0021（R15 终审）：头像颜色、默认色板、密码修改时间、登录设备名、官方批次名。
 * 在 PGlite 上验证：全新库升到 0021 新列都在；带存量数据从 0020 升级时新列为 null、旧数据不变；
 * down 回滚后日志回到 0020，且可以再次升级。
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const migrationsFolder = resolve(process.cwd(), 'db/migrations');
const TAG = '0021_account_profile_and_batch_names';
const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as {
  entries: Array<{ idx: number; tag: string; when: number }>;
};
const temporary: string[] = [];

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

describe('迁移 0021', () => {
  it('journal 第 21 项就是 0021，且 down 文件删除的正是它的时间戳', () => {
    const entry = journal.entries.find((item) => item.tag === TAG)!;
    expect(entry).toMatchObject({ idx: 21, tag: TAG });
    const down = readFileSync(join(migrationsFolder, 'down', `${TAG}.down.sql`), 'utf8');
    expect(down).toContain(`created_at = ${entry.when}`);
  });

  it('全新库升到 0021：五个新列都在', async () => {
    const client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder: folderUntil(TAG) });
    expect(await columns(client, 'users')).toEqual(expect.arrayContaining(['avatar_color', 'default_palette', 'password_changed_at']));
    expect(await columns(client, 'sessions')).toContain('device_label');
    expect(await columns(client, 'official_batches')).toContain('name');
    await client.close();
  });

  it('带存量数据从 0020 升到 0021 新列为 null，down 回滚后可再次升级', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folderUntil('0020_discovery_notifications') });
    const userId = await scalar<string>(client, "insert into users(email, username, email_verified_at) values ('m0021@example.test', '小豆', now()) returning id");
    await client.query("insert into sessions(user_id, token_hash, expires_at) values ($1, 'hash-0021', now() + interval '1 day')", [userId]);
    const batchId = await scalar<string>(client, "insert into official_batches(default_params, engine_version, admin_user_id) values ('{}'::jsonb, 'e', $1) returning id", [userId]);

    await migrate(db, { migrationsFolder: folderUntil(TAG) });
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(22);
    const user = (await client.query<{ username: string; avatar_color: string | null; default_palette: string | null; password_changed_at: string | null }>(
      'select username, avatar_color, default_palette, password_changed_at from users where id = $1', [userId],
    )).rows[0];
    expect(user).toEqual({ username: '小豆', avatar_color: null, default_palette: null, password_changed_at: null });
    expect(await scalar<string | null>(client, "select device_label from sessions where token_hash = 'hash-0021'")).toBeNull();
    expect(await scalar<string | null>(client, 'select name from official_batches where id = $1', [batchId])).toBeNull();

    await client.query("update users set avatar_color = '#E0473F', default_palette = 'builtin:COCO', password_changed_at = now() where id = $1", [userId]);
    await client.query("update sessions set device_label = 'macOS · Chrome' where token_hash = 'hash-0021'");
    await client.query("update official_batches set name = '秋日动物系列' where id = $1", [batchId]);
    await client.exec(readFileSync(join(migrationsFolder, 'down', `${TAG}.down.sql`), 'utf8'));
    expect(await columns(client, 'users')).not.toContain('avatar_color');
    expect(await columns(client, 'users')).not.toContain('default_palette');
    expect(await columns(client, 'users')).not.toContain('password_changed_at');
    expect(await columns(client, 'sessions')).not.toContain('device_label');
    expect(await columns(client, 'official_batches')).not.toContain('name');
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(21);
    expect(await scalar<string>(client, 'select username from users where id = $1', [userId])).toBe('小豆');

    await migrate(db, { migrationsFolder: folderUntil(TAG) });
    expect(await scalar<number>(client, 'select count(*)::int from drizzle.__drizzle_migrations')).toBe(22);
    expect(await scalar<string | null>(client, 'select avatar_color from users where id = $1', [userId])).toBeNull();
    await client.close();
  });
});
