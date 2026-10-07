const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const path = require('node:path');
const braces = require('../../vendor/braces');
const fixtures = require('./braces-upstream-fixtures.json');

test('matches unmodified braces 3.0.3 for 192 option/pattern fixtures (576 results)', () => {
  for (const fixture of fixtures) {
    for (const method of ['compile', 'stringify', 'expand']) {
      let result;
      try {
        result = braces[method](fixture.input, fixture.options);
      } catch (error) {
        result = { error: error.constructor.name, message: error.message };
      }
      assert.deepEqual(result, fixture[method], `${method}: ${JSON.stringify(fixture.input)}`);
    }
  }
});

test('retains valid boundary nesting, escaped/quoted/literal braces and range limits', () => {
  const nested = '{'.repeat(128) + 'a,b' + '}'.repeat(128);
  assert.equal(braces.stringify(nested), nested);
  assert.doesNotThrow(() => braces.compile(nested));
  assert.doesNotThrow(() => braces.expand(nested));
  for (const literal of ['\\{'.repeat(1000), '"' + '{'.repeat(1000) + '"', '[' + '{'.repeat(1000) + ']']) {
    assert.doesNotThrow(() => braces.compile(literal));
  }
  assert.throws(() => braces.expand('{1..1001}'), /range limit/);
  assert.deepEqual(braces.expand('{1..3}', { rangeLimit: 3 }), ['1', '2', '3']);
  const ast = braces.parse('foo/{a,b}/bar');
  assert.equal(braces.stringify(ast.nodes[2]), '{a,b}');
  assert.deepEqual(braces(['{a,b}', '{b,c}'], { expand: true, nodupes: true }), ['a', 'b', 'c']);
});

test('retains upstream results for a valid shared child subtree', () => {
  const dag = () => {
    const root = { type: 'root', nodes: [] };
    const shared = { type: 'paren', parent: root, nodes: [] };
    shared.nodes = [{ type: 'text', value: 'x', parent: shared }, { type: 'text', value: 'y', parent: shared }];
    root.nodes = [shared, shared];
    return root;
  };
  // Verified against the integrity-pinned, unmodified braces 3.0.3 archive.
  // Shared nodes are valid; only cycles or excessive traversal are rejected.
  for (const method of ['compile', 'stringify', 'expand']) {
    const expected = method === 'expand' ? ['xyxy'] : 'xyxy';
    assert.deepEqual(braces[method](dag()), expected);
    assert.deepEqual(require('../../vendor/braces/lib/' + method)(dag()), expected);
  }
});

// Every hostile input runs in an isolated process with a hard timeout. A future
// regression in cycle handling must fail this test, never hang the CI process.
test('rejects deep strings and hostile external ASTs before recursive work', () => {
  const result = spawnSync(process.execPath, ['-e', String.raw`
    const assert = require('node:assert/strict');
    const braces = require('./vendor/braces');
    for (const pattern of ['{'.repeat(4999) + 'x', '('.repeat(4999) + 'x', '{('.repeat(2000) + 'x', '{'.repeat(129) + 'a,b' + '}'.repeat(129)]) {
      for (const method of ['parse', 'compile', 'stringify', 'expand', 'create']) {
        assert.throws(() => braces[method](pattern, { maxDepth: Infinity, maxLength: Infinity }), { code: 'ERR_BRACES_DEPTH' });
      }
    }
    function deep() {
      let node = { type: 'text', value: 'x' };
      for (let i = 0; i < 5000; i++) node = { type: 'paren', nodes: [node] };
      return { type: 'root', nodes: [node] };
    }
    function cycle() { const root = { type: 'root', nodes: [] }; root.nodes.push(root); return root; }
    function parentCycle() {
      const child = { type: 'paren', nodes: [] }; child.parent = child;
      return { type: 'root', nodes: [child] };
    }
    function indirectParentCycle() {
      const a = { type: 'paren', nodes: [] }, b = { type: 'paren', nodes: [] };
      a.parent = b; b.parent = a;
      return { type: 'root', nodes: [a] };
    }
    function parentDepth() {
      const child = { type: 'text', value: 'x' }; let current = child;
      for (let i = 0; i < 5000; i++) current = current.parent = { type: 'paren' };
      return { type: 'root', nodes: [child] };
    }
    function sharedDag() {
      let node = { type: 'text', value: 'x' };
      for (let i = 0; i < 30; i++) node = { type: 'paren', nodes: [node, node] };
      return { type: 'root', nodes: [node] };
    }
    function cyclicValue() { const value = []; value.push(value); return { type: 'root', nodes: [{ type: 'text', value }] }; }
    for (const method of ['compile', 'stringify', 'expand']) {
      for (const [factory, code] of [[deep, 'ERR_BRACES_DEPTH'], [cycle, 'ERR_BRACES_CYCLE'], [parentCycle, 'ERR_BRACES_CYCLE'], [indirectParentCycle, 'ERR_BRACES_CYCLE'], [parentDepth, 'ERR_BRACES_DEPTH'], [sharedDag, 'ERR_BRACES_SIZE']]) {
        assert.throws(() => braces[method](factory()), { code });
        assert.throws(() => require('./vendor/braces/lib/' + method)(factory()), { code });
      }
      assert.throws(() => braces[method](cyclicValue()), TypeError);
    }
    function externalParentQueue(queue) {
      const parent = { type: 'root', queue };
      return { type: 'root', nodes: [{ type: 'paren', parent, nodes: [{ type: 'text', value: 'x' }] }] };
    }
    const loop = []; loop.push(loop);
    let deepQueue = ['x'];
    for (let i = 0; i < 15000; i++) deepQueue = [deepQueue];
    for (const queue of [[loop], deepQueue]) {
      assert.throws(() => braces.expand(externalParentQueue(queue)), { code: 'ERR_BRACES_PARENT' });
      assert.throws(() => require('./vendor/braces/lib/expand')(externalParentQueue(queue)), { code: 'ERR_BRACES_PARENT' });
    }
    console.log('hostile inputs rejected');
  `], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /hostile inputs rejected/);
});
