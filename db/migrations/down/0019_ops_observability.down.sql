-- Safe only if the admin log console is no longer expected to hold history:
-- dropping these tables discards all recorded errors, events and slow queries.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP TABLE IF EXISTS "system_logs";
DROP TABLE IF EXISTS "slow_queries";
DROP INDEX IF EXISTS "community_tags_merged_into_idx";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1790145553031;
COMMIT;
