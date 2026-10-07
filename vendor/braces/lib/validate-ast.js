'use strict';

// The upstream input limit does not bound recursion: 10,000 characters can
// still contain thousands of nested braces/parentheses. Keep both parsed and
// caller-supplied trees below a conservative stack bound.
const MAX_NESTING = 128;
const MAX_AST_DEPTH = MAX_NESTING + 1; // Include the innermost text/open node.
const MAX_AST_VISITS = 20000; // More than any AST parsed from MAX_LENGTH input.

const fail = (code, message) => {
  const error = new RangeError(message);
  error.code = code;
  throw error;
};

const checkNesting = depth => {
  if (depth > MAX_NESTING) {
    fail('ERR_BRACES_DEPTH', `Brace nesting exceeds ${MAX_NESTING}`);
  }
};

// Only nodes[] is the recursive tree. parent and prev normally point back to
// ancestors/siblings, so traversing every property would reject valid ASTs.
// expand also walks parent chains; validate those separately, without recursion.
const validate = ast => {
  const active = new Set();
  const stack = [{ node: ast, depth: 0, exit: false }];
  let scheduled = 1;
  while (stack.length) {
    const { node, depth, exit } = stack.pop();
    if (exit) {
      active.delete(node);
      continue;
    }
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      throw new TypeError('Expected a braces AST node');
    }
    if (active.has(node)) fail('ERR_BRACES_CYCLE', 'Cyclic braces AST');
    if (depth > MAX_AST_DEPTH) fail('ERR_BRACES_DEPTH', `Brace AST depth exceeds ${MAX_AST_DEPTH}`);
    // An array/object value can inject recursive arrays into expand's queues.
    if (node.value !== undefined && node.value !== null && !['string', 'number', 'boolean'].includes(typeof node.value)) {
      throw new TypeError('Expected a primitive braces AST value');
    }
    const parents = new Set([node]);
    let parent = node.parent;
    let parentDepth = 0;
    while (parent) {
      if (parents.has(parent)) fail('ERR_BRACES_CYCLE', 'Cyclic braces AST parent chain');
      if (++parentDepth > MAX_AST_DEPTH) fail('ERR_BRACES_DEPTH', `Brace AST parent depth exceeds ${MAX_AST_DEPTH}`);
      if (typeof parent !== 'object' || Array.isArray(parent)) throw new TypeError('Expected a braces AST parent');
      parents.add(parent);
      parent = parent.parent;
    }
    if (node.nodes !== undefined) {
      if (!Array.isArray(node.nodes)) throw new TypeError('Expected braces AST nodes array');
      // Check before scheduling children so a wide external AST cannot first
      // allocate an unbounded second array of traversal frames.
      scheduled += node.nodes.length;
      if (scheduled > MAX_AST_VISITS) fail('ERR_BRACES_SIZE', `Brace AST exceeds ${MAX_AST_VISITS} visits`);
      active.add(node);
      stack.push({ node, depth, exit: true });
      for (let i = node.nodes.length - 1; i >= 0; i--) {
        stack.push({ node: node.nodes[i], depth: depth + 1, exit: false });
      }
    }
  }
};

module.exports = { checkNesting, validate, MAX_NESTING, MAX_AST_DEPTH };
