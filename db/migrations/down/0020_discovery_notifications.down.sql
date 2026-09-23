-- 仅在站内通知、作者建议标签与类目条图标 / 精选设置都不必保留时执行：
-- 回滚会丢弃全部通知、全部建议标签以及标签的展示设置。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP TABLE IF EXISTS "notifications";
ALTER TABLE "community_revisions" DROP COLUMN IF EXISTS "suggested_tags";
ALTER TABLE "community_tags" DROP COLUMN IF EXISTS "featured";
ALTER TABLE "community_tags" DROP COLUMN IF EXISTS "icon";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1790155106277;
COMMIT;
