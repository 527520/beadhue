const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const lock = require('../../package-lock.json');
const forkPath = fs.realpathSync(path.join(root, 'vendor/braces/index.js'));

test('every installed braces consumer resolves to the maintained source', () => {
  let consumers = 0;
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (!metadata.dependencies?.braces) continue;
    const from = createRequire(path.join(root, location, 'package.json'));
    assert.equal(fs.realpathSync(from.resolve('braces')), forkPath, location || 'root');
    // Validate the actual installed path, not only the separately tested vendor.
    assert.throws(() => from('braces').compile('{'.repeat(4000) + 'x'), { code: 'ERR_BRACES_DEPTH' });
    consumers++;
  }
  assert.ok(consumers >= 2, 'the test must include real transitive consumers');
});

test('micromatch retains normal glob matching and rejects pathological brace expansion', () => {
  const micromatch = require('micromatch');
  assert.deepEqual(micromatch(['src/a.ts', 'src/b.tsx', 'src/a.test.ts', 'doc.md'], ['src/**/*.{ts,tsx}', '!**/*.test.ts']), ['src/a.ts', 'src/b.tsx']);
  assert.deepEqual(micromatch.braceExpand('board-{01..03}/{a,b}'), ['board-01/a', 'board-01/b', 'board-02/a', 'board-02/b', 'board-03/a', 'board-03/b']);
  assert.throws(() => micromatch.braceExpand('{'.repeat(4000) + 'a,b' + '}'.repeat(4000)), { code: 'ERR_BRACES_DEPTH' });
});

test('Web and native React remain isolated', () => {
  const web = createRequire(path.join(root, 'package.json'));
  const mini = createRequire(path.join(root, 'apps/weapp/package.json'));
  assert.equal(web('react/package.json').version.split('.')[0], '19');
  assert.equal(mini('react/package.json').version, '18.3.1');
  assert.equal(mini('react-dom/package.json').version, '18.3.1');
});
