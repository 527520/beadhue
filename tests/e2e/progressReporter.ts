import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * E2E 诊断上报（仅 CI 启用）。
 *
 * 动机：CI 上 E2E 出问题（卡住 / 超时 / 失败）时，步骤日志与 playwright-report
 * 都要登录才能看，匿名可读的只有 check-run annotation。这里把「哪一步坏了」
 * 写成 annotation。
 *
 * 用量纪律（踩过坑）：GitHub 对单个 check run 的 annotation 数量有上限，
 * 超出的会被静默丢弃——前几轮每 25 个用例发一条进度心跳，结果 30 多条里只留下
 * 10 条，反而看不出真实进度，白白浪费一轮排查。所以这里只在**出问题时**上报，
 * 正常跑完整个套件最多 2 条。
 */
class E2EDiagnosticsReporter implements Reporter {
  private total = 0;
  private finished = 0;
  private startedAt = 0;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length;
    this.startedAt = Date.now();
  }

  onTestBegin(_test: TestCase): void {
    // 不需要逐用例事件：只关心结果。
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.finished += 1;
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    const seconds = Math.round(result.duration / 1000);
    const label = result.status === 'timedOut' ? '超时' : '失败';
    // 取错误详情：不同 Playwright 版本把断言消息放在 error / errors[0] 上，
    // 只读 error.message 可能拿到空串（本地实测如此），两边都看。
    const raw = result.error?.message ?? result.errors?.[0]?.message ?? '';
    const detail = raw
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1400);
    this.annotate('failure', `用例${label}（${seconds}s，第 ${this.finished}/${this.total} 个）：${test.titlePath().filter(Boolean).join(' › ')}${detail ? ` | ${detail}` : ''}`);
  }

  onEnd(result: FullResult): void {
    const min = ((Date.now() - this.startedAt) / 60000).toFixed(1);
    // 正常跑完只有这一条（notice 级别），不会挤掉 failure/warning。
    this.annotate('notice', `本轮结束：status=${result.status}，完成 ${this.finished}/${this.total}，用时 ${min} 分钟`);
  }

  private annotate(level: 'notice' | 'warning' | 'failure', message: string): void {
    const text = `[e2e-diag] ${message}`;
    // 本地没有 GITHUB_ACTIONS：只打 stdout，避免污染本机输出。
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::${level}::${text}`);
    }
  }
}

export default E2EDiagnosticsReporter;
