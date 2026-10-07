# BeadHue maintained braces fork

This private package is based on **braces 3.0.3**, not a new upstream release.
The original MIT license is preserved in `LICENSE`. `UPSTREAM.json` records the
official npm tarball integrity and the original runtime files' SHA-256 hashes.

## Security change

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published upstream patch as of 2026-10-07. Upstream discussion:
<https://github.com/micromatch/braces/issues/70>.

- `parse` rejects more than 128 nested braces/parentheses before adding a node.
  Escaped, quoted and square-bracket literal characters do not count as nesting.
- `compile`, `stringify` and `expand` validate caller-supplied ASTs iteratively
  before recursion. The bounds are 129 child/parent edges and 20,000 scheduled
  node visits (above any ordinary AST from upstream's 10,000-character input).
- Child cycles and parent-chain cycles are rejected. Non-primitive values are
  rejected to prevent injecting recursive arrays into expansion queues.
- Expansion uses only queues initialized in its current traversal. An external
  parent cannot inject a pre-existing cyclic/deep queue through a parent link.
- The bounds cannot be disabled through options. Existing range limits remain.
  These guards address recursion/cycles; they do not promise a universal bound
  for every Cartesian-product expansion or arbitrary user callback.

The original algorithms and public entry points are retained. Tests compare
576 outputs captured from unmodified 3.0.3 and run hostile inputs in a subprocess
with a hard timeout. This is a locally maintained security change, not an
upstream endorsement or an audit exemption.

## Maintenance

Run `node --test tests/security/braces.test.cjs` from the repository root. The
installed dependency graph must also resolve every braces consumer to this
directory, and the unmodified production audit command must pass. Review any
new upstream advisory against this source: npm cannot automatically assess a
private fork. Replace this fork only after a real upstream fix passes the same
regression suite, then remove the root anchor and override together.
