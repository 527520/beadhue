#!/usr/bin/env bash
# 票 14：本机内存 16 GB 时，E2E 的 Turbopack 开发服务跑到六十多条用例就涨到 10 GB 以上，交换区把磁盘写满。
# 改为按用例文件分批：每批一次独立的 playwright 调用（globalSetup 各自新起开发服务），用例与配置不变。
# 用法（仓库根目录）：bash .scratch/ui-rebuild/tools/e2e-batched.sh chromium [firefox webkit]
set -uo pipefail
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
OUT=.scratch/ui-rebuild/evidence/e2e
mkdir -p "$OUT"
BATCHES=(
  "00-helpers 01-auth-journey 02-workbench-journey 03-upload-edge 04-design-sync 05-crop-interaction 06-accessibility-responsive"
  "07-image-orientation 09-export-extremes 10-home-upload 11-bounded-canvas-workspace 12-community-governance 13-optional-recrop"
  "14-admin-task-workflows 15-official-batch-recovery 16-review-recovery 17-beadhue-redesign 17-visual-refinement"
  "18-admin-round-3 18-community-tags-mobile 18-workbench-feedback 19-notifications"
)
status=0
for project in "$@"; do
  for index in "${!BATCHES[@]}"; do
    files=()
    for name in ${BATCHES[$index]}; do files+=("tests/e2e/${name}.spec.ts"); done
    log="$OUT/${project}-batch$((index + 1)).log"
    npx playwright test --project="$project" "${files[@]}" > "$log" 2>&1
    code=$?
    summary=$(grep -E "^\s+[0-9]+ (passed|failed|skipped|flaky)" "$log" | tr -s ' ' | tr '\n' ' ')
    echo "$project 第 $((index + 1)) 批 exit=$code ${summary}| 交换区 $(sysctl -n vm.swapusage | awk '{print $6}') | 磁盘可用 $(df -h /System/Volumes/Data | awk 'NR==2 {print $4}')"
    [ "$code" = 0 ] || status=1
  done
done
exit "$status"
