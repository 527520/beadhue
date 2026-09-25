#!/usr/bin/env bash
# R15 票 14：本机复现 CI 的「standalone 生产启动 + PostgreSQL 路由合同 + 浏览器冒烟」。
# 与 CI 的差别只在于应用不打镜像：用本机 `npm run build` 的 standalone 产物直接起 `node server.js`；
# PostgreSQL 16 默认用 Docker（与 CI service 同一镜像）；Docker 起不来时 `PG_MODE=embedded` 改用 embedded-postgres 的官方二进制
# （装在 EMBEDDED_PG_DIR，默认 /tmp/beadhue-pg，内含 start.mjs）。种子行、路由合同与四个冒烟用例同 .github/workflows/ci.yml。
# 用法（仓库根目录，先 `npm run build`）：[PG_MODE=embedded] bash .scratch/ui-rebuild/tools/production-smoke.sh
set -uo pipefail

PG_NAME=beadhue-pg-smoke
PG_PORT=55432
PG_MODE=${PG_MODE:-docker}
EMBEDDED_PG_DIR=${EMBEDDED_PG_DIR:-/tmp/beadhue-pg}
APP_PORT=3000
export DATABASE_URL="postgresql://beadhue:beadhue-ci-password@127.0.0.1:${PG_PORT}/beadhue"
OUT=.scratch/ui-rebuild/evidence/production-smoke
mkdir -p "$OUT"

cleanup() {
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  if [ "$PG_MODE" = embedded ]; then [ -n "${PG_PID:-}" ] && kill "$PG_PID" 2>/dev/null; wait "${PG_PID:-}" 2>/dev/null
  else docker rm -f "$PG_NAME" >/dev/null 2>&1; fi
}
trap cleanup EXIT

if [ "$PG_MODE" = embedded ]; then
  PG_PORT="$PG_PORT" node "$EMBEDDED_PG_DIR/start.mjs" > "$OUT/postgres.log" 2>&1 &
  PG_PID=$!
  for _ in $(seq 1 60); do grep -q '^ready' "$OUT/postgres.log" 2>/dev/null && break; kill -0 "$PG_PID" 2>/dev/null || break; sleep 1; done
  grep -q '^ready' "$OUT/postgres.log" || { echo "stage=postgres-start"; cat "$OUT/postgres.log"; exit 30; }
else
  docker rm -f "$PG_NAME" >/dev/null 2>&1
  docker run -d --name "$PG_NAME" -e POSTGRES_DB=beadhue -e POSTGRES_USER=beadhue -e POSTGRES_PASSWORD=beadhue-ci-password \
    -p "${PG_PORT}:5432" postgres:16-alpine >/dev/null || { echo "stage=postgres-start"; exit 30; }
  for _ in $(seq 1 60); do docker exec "$PG_NAME" pg_isready -U beadhue -d beadhue >/dev/null 2>&1 && break; sleep 1; done
  sleep 2
fi
psql_exec() { node -e "const { Client } = require('pg'); (async () => { const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); try { await c.query(process.argv[1]); } finally { await c.end(); } })().catch((e) => { console.error(e.message); process.exit(1); })" -- "$1"; }

node db/migrate.cjs > "$OUT/migrate.log" 2>&1 || { echo "stage=migrate"; tail -20 "$OUT/migrate.log"; exit 30; }

# standalone 产物需要自带静态资源与 public（Dockerfile 同样复制这两处）。
rm -rf .next/standalone/.next/static .next/standalone/public
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public

(cd .next/standalone && env NODE_ENV=production PORT="$APP_PORT" HOSTNAME=127.0.0.1 \
  APP_URL=https://example.test DATABASE_URL="$DATABASE_URL" \
  SMTP_HOST=mail.example.test SMTP_USER=ci SMTP_PASS=ci SMTP_FROM=ci@example.test \
  BACKUP_ALERT_TOKEN=ci-backup-alert-token-32-characters ADMIN_EMAIL=ops@example.test \
  ANALYTICS_IP_HMAC_KEY=ci-analytics-ip-hmac-key-32-characters \
  COS_BUCKET=ci COS_SECRET_ID=ci COS_SECRET_KEY=ci COS_REGION=ap-guangzhou \
  node server.js) > "$OUT/server.log" 2>&1 &
APP_PID=$!
healthy=false
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:${APP_PORT}/" >/dev/null 2>&1 && { healthy=true; break; }
  kill -0 "$APP_PID" 2>/dev/null || break
  sleep 1
done
[ "$healthy" = true ] || { echo "stage=health-check"; tail -40 "$OUT/server.log"; exit 31; }

token() { node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"; }
hash() { node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" -- "$1"; }
SESSION_TOKEN=$(token); VERIFY_TOKEN=$(token); ADMIN_TOKEN=$(token)
psql_exec "
  INSERT INTO users(id,email,password_hash,email_verified_at) VALUES
    ('00000000-0000-4000-8000-000000000101','production-contract@example.test','not-used',now()),
    ('00000000-0000-4000-8000-000000000102','production-token@example.test','not-used',NULL);
  INSERT INTO users(id,email,password_hash,email_verified_at,role) VALUES
    ('00000000-0000-4000-8000-000000000103','production-admin@example.test','not-used',now(),'admin');
  INSERT INTO sessions(user_id,token_hash,expires_at,absolute_expires_at)
    VALUES ('00000000-0000-4000-8000-000000000101','$(hash "$SESSION_TOKEN")',now()+interval '30 days',now()+interval '90 days');
  INSERT INTO sessions(user_id,token_hash,expires_at,absolute_expires_at)
    VALUES ('00000000-0000-4000-8000-000000000103','$(hash "$ADMIN_TOKEN")',now()+interval '14 days',now()+interval '74 days');
  INSERT INTO email_tokens(user_id,purpose,token_hash,expires_at)
    VALUES ('00000000-0000-4000-8000-000000000102','verify','$(hash "$VERIFY_TOKEN")',now()+interval '1 day');" > "$OUT/seed.log" 2>&1 \
  || { echo "stage=seed"; cat "$OUT/seed.log"; exit 30; }

export E2E_BASE_URL="http://127.0.0.1:${APP_PORT}" E2E_SESSION_TOKEN="$SESSION_TOKEN" E2E_VERIFY_TOKEN="$VERIFY_TOKEN" E2E_ADMIN_SESSION_TOKEN="$ADMIN_TOKEN"
node tests/postgres/route-contract.cjs > "$OUT/route-contract.log" 2>&1
route=$?
echo "route-contract exit=$route"
smoke=0
for pair in "33|an aging administrator can render read-only pages" "34|standalone production CSP permits RSC navigation" "35|standalone routes enforce PostgreSQL CAS" "36|long-range production analytics includes live consented data"; do
  code=${pair%%|*}; title=${pair#*|}
  npx playwright test --config playwright.production.config.mts -g "$title" > "$OUT/smoke-$code.log" 2>&1
  status=$?
  echo "smoke $code exit=$status ($title)"
  [ "$status" = 0 ] || smoke=$code
done
[ "$route" = 0 ] || exit 32
exit "$smoke"
