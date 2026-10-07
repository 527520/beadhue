const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const mini = createRequire(path.join(root, 'apps/weapp/package.json'));
const records = require('../../vendor/taro-native/UPSTREAM.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('native Taro archives preserve all upstream runtime/types except the documented entry guards', () => {
  for (const record of records) {
    const archive = fs.readFileSync(path.join(root, 'vendor/taro-native', record.archive));
    assert.equal('sha512-' + crypto.createHash('sha512').update(archive).digest('base64'), record.archiveIntegrity);
    const installed = path.dirname(mini.resolve(record.upstream + '/package.json'));
    for (const [file, expected] of Object.entries(record.maintainedSha256)) {
      assert.equal(sha256(fs.readFileSync(path.join(installed, file))), expected, `${record.upstream}/${file}`);
    }
    for (const [file, expected] of Object.entries(record.originalSha256)) {
      if (file === 'package.json' || file === 'index.js') continue;
      assert.equal(record.maintainedSha256[file], expected, `upstream source changed: ${file}`);
    }
    if (record.upstream === '@tarojs/taro') {
      const prefix = fs.readFileSync(path.join(root, 'vendor/taro-native/api-entry-prefix.cjs'), 'utf8') + '\n';
      const entry = fs.readFileSync(path.join(installed, 'index.js'), 'utf8');
      assert.ok(entry.startsWith(prefix));
      assert.equal(sha256(entry.slice(prefix.length)), record.originalSha256['index.js']);
    }
    const manifest = mini(record.upstream + '/package.json');
    assert.equal(manifest.name, record.name);
    for (const peer of record.removedPeers) assert.equal(manifest.peerDependencies[peer], undefined);
    assert.match(fs.readFileSync(path.join(installed, 'LICENSE'), 'utf8'), /Copyright \(c\) 2018 O2Team/);
  }
});

test('native adapters reject H5/Vite before loading those compiler paths', () => {
  const result = spawnSync(process.execPath, ['-e', String.raw`
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const mini = require('node:module').createRequire(path.resolve('apps/weapp/package.json'));
    const plugin = mini('@tarojs/plugin-framework-react');
    process.env.TARO_ENV = 'h5';
    assert.throws(() => mini('@tarojs/taro'), /supports only weapp/);
    assert.throws(() => plugin({initialConfig: {compiler: 'webpack5'}}), /supports only webpack5\/weapp/);
    process.env.TARO_ENV = 'weapp';
    assert.throws(() => plugin({initialConfig: {compiler: 'vite'}}), /supports only webpack5\/weapp/);
    assert.throws(() => plugin({initialConfig: {compiler: {type: 'vite'}}}), /supports only webpack5\/weapp/);
    let hooks = 0;
    plugin({initialConfig: {compiler: 'webpack5', framework: 'react'}, modifyWebpackChain(){hooks++}, modifyRunnerOpts(){hooks++}});
    assert.equal(hooks, 2);
    // The native API runtime needs Taro's compile-time feature constants; its
    // successful path is checked by the actual native build, not plain Node.
    assert.equal(mini('react/package.json').version, '18.3.1');
  `], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
