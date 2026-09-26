#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const rounds = Number(process.argv[2]);
if (!Number.isSafeInteger(rounds) || rounds < 1) {
  process.stderr.write('usage: stable.cjs <positive-rounds> [chromium|firefox|webkit]\n');
  process.exit(2);
}
const browsers = ['chromium', 'firefox', 'webkit'];
const browser = process.argv[3];
if (process.argv.length > 4 || (browser && !browsers.includes(browser))) {
  process.stderr.write('usage: stable.cjs <positive-rounds> [chromium|firefox|webkit]\n');
  process.exit(2);
}

const specs = readdirSync(join(process.cwd(), 'tests/e2e'))
  .filter((name) => /^\d{2}-.*\.spec\.ts$/.test(name) && name !== '08-production-runtime.spec.ts')
  .sort();
const phases = [
  specs.filter((name) => Number(name.slice(0, 2)) < 12),
  specs.filter((name) => Number(name.slice(0, 2)) >= 12),
];
if (phases.some((phase) => phase.length === 0)) throw new Error('E2E phases must both contain tests');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (let round = 1; round <= rounds; round += 1) {
  for (const project of browser ? [browser] : browsers) {
    for (let index = 0; index < phases.length; index += 1) {
      const files = phases[index].map((name) => `tests/e2e/${name}`);
      process.stdout.write(`[e2e] round ${round}/${rounds}, ${project}, phase ${index + 1}/${phases.length} (${files.length} specs)\n`);
      const result = spawnSync(npm, ['run', 'test:e2e', '--', `--project=${project}`, ...files], {
        cwd: process.cwd(),
        // Each server gets a freshly seeded in-memory database. A persistent
        // PGlite dataDir needs a clean close before it can safely be reopened.
        env: { ...process.env, E2E_PGLITE_DATA_DIR: '', E2E_BROWSER: project },
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = result.status ?? 1;
      if (process.exitCode) break;
    }
    if (process.exitCode) break;
  }
  if (process.exitCode) break;
}
