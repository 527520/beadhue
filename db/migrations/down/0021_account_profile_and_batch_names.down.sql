-- 仅在头像颜色、默认色板、密码修改时间、登录设备名与批次名都不必保留时执行：
-- 回滚会丢弃用户选的头像颜色与默认色板、全部登录设备名和管理员起的批次名（其余数据不变）。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_changed_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "default_palette";
ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_color";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "device_label";
ALTER TABLE "official_batches" DROP COLUMN IF EXISTS "name";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1790260650360;
COMMIT;
