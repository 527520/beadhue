#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const rounds = Number(process.argv[2]);
if (!Number.isSafeInteger(rounds) || rounds < 1) {
  process.stderr.write('usage: stable.cjs <positive-rounds>\n');
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
  // One disposable database per complete round; phase/server restarts preserve
  // the same cross-spec and cross-browser state as a single Playwright run.
  const dataDir = mkdtempSync(join(tmpdir(), 'beadhue-e2e-round-'));
  try {
    for (const project of ['chromium', 'firefox', 'webkit']) {
      for (let index = 0; index < phases.length; index += 1) {
        const files = phases[index].map((name) => `tests/e2e/${name}`);
        process.stdout.write(`[e2e] round ${round}/${rounds}, ${project}, phase ${index + 1}/${phases.length} (${files.length} specs)\n`);
        const result = spawnSync(npm, ['run', 'test:e2e', '--', `--project=${project}`, ...files], {
          cwd: process.cwd(),
          env: { ...process.env, E2E_PGLITE_DATA_DIR: dataDir },
          stdio: 'inherit',
        });
        if (result.error) throw result.error;
        if (result.status !== 0) process.exitCode = result.status ?? 1;
        if (process.exitCode) break;
      }
      if (process.exitCode) break;
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  if (process.exitCode) break;
}
