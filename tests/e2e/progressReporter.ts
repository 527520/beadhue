import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * E2E 进度心跳（仅 CI 启用）。
 *
 * 动机：E2E 步骤在 CI 上偶尔会从 ~33 分钟涨到 60 分钟被 job 级 timeout 杀掉，
 * 而「哪一步/哪个用例卡住」本地复现不出来（本地全量三浏览器 15 分钟全绿），
 * 步骤日志与 playwright-report 又都要登录才能看。匿名可读的只有 check-run
 * annotation，所以这里把进度与超时用例写成 annotation。
 *
 * 用量控制：整套 91 用例 × 3 浏览器 × 3 轮 ≈ 750 次执行，每次一条会把
 * annotation 刷爆，因此只按固定间隔发心跳，另外对「失败 / 超时 / 耗时异常」
 * 全量发送，并附上卡住的是第几个用例、已用时多久。
 */
const HEARTBEAT_EVERY = 25;

class E2EProgressReporter implements Reporter {
  private total = 0;
  private finished = 0;
  private startedAt = 0;
  /** 已开始但尚未结束的用例（卡住时它就是「正在跑什么」的答案）。 */
  private readonly running = new Map<TestCase, number>();

  onBegin(_config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length;
    this.startedAt = Date.now();
    this.annotate('notice', `心跳启动：共 ${this.total} 个用例（含各浏览器与重复轮次）`);
  }

  onTestBegin(test: TestCase): void {
    this.running.set(test, Date.now());
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // workers=1 且 --repeat-each 会让同一用例重复执行，用 TestCase 对象本身关联，
    // 每次执行都是独立对象，不会串号。
    this.running.delete(test);
    this.finished += 1;
    const seconds = Math.round(result.duration / 1000);
    const where = `${test.titlePath().join(' › ')}（已完成 ${this.finished}/${this.total}）`;
    if (result.status === 'timedOut') {
      this.annotate('failure', `用例超时（${seconds}s）：${where}`);
      return;
    }
    if (result.status === 'failed') {
      this.annotate('failure', `用例失败（${seconds}s）：${where}`);
      return;
    }
    // 明显偏慢的用例也报：CI 上单用例 >5 分钟基本就是卡顿前兆。
    if (seconds > 300) {
      this.annotate('warning', `用例耗时偏长（${seconds}s）：${where}`);
    }
    if (this.finished % HEARTBEAT_EVERY === 0) {
      const min = ((Date.now() - this.startedAt) / 60000).toFixed(1);
      this.annotate('notice', `进度 ${this.finished}/${this.total}，已用时 ${min} 分钟`);
    }
  }

  onEnd(result: FullResult): void {
    const min = ((Date.now() - this.startedAt) / 60000).toFixed(1);
    const stuck = [...this.running.entries()]
      .map(([test, at]) => `${test.titlePath().join(' › ')}（已跑 ${Math.round((Date.now() - at) / 1000)}s）`)
      .join('；');
    this.annotate(
      'notice',
      `本轮结束：status=${result.status}，完成 ${this.finished}/${this.total}，用时 ${min} 分钟${stuck ? `；结束时仍在跑：${stuck}` : ''}`,
    );
  }

  private annotate(level: 'notice' | 'warning' | 'failure', message: string): void {
    const text = `[e2e-progress] ${message}`;
    console.log(text);
    // 本地没有 GITHUB_ACTIONS：只打 stdout，避免污染本机输出。
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::${level}::${text}`);
    }
  }
}

export default E2EProgressReporter;
