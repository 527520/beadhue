import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// Keep the maintained dependency regressions inside the existing CI unit gate.
// node:test also permits running them before installing the dependency update.
it('maintained dependency security and installed graph regressions pass', () => {
  const result = spawnSync(process.execPath, [
    '--test',
    'tests/security/braces.test.cjs',
    'tests/security/dependency-graph.test.cjs',
    'tests/security/standalone-boundary.test.cjs',
    'tests/security/taro-native.test.cjs',
  ], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8',
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}, 20_000);
