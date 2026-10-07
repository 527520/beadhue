const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { checkStandaloneBoundary } = require('../../scripts/check-standalone-boundary.cjs');

test('standalone gate allows Next internals but rejects external native/build packages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beadhue-standalone-boundary-'));
  try {
    const next = path.join(root, 'node_modules/next/dist/compiled/micromatch');
    fs.mkdirSync(next, { recursive: true });
    fs.writeFileSync(path.join(next, 'index.js'), 'module.exports = {};');
    assert.doesNotThrow(() => checkStandaloneBoundary(root));
    for (const resource of ['node_modules/braces', 'node_modules/@tarojs/runtime', 'node_modules/@beadhue/taro-react-webpack', 'apps/weapp/node_modules/vite', 'vendor/braces', 'vendor/taro-native']) {
      const directory = path.join(root, resource);
      fs.mkdirSync(directory, { recursive: true });
      assert.throws(() => checkStandaloneBoundary(root), /Standalone includes native\/build dependency/);
      fs.rmSync(directory, { recursive: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
