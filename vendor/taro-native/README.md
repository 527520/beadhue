# Taro 4.2.1 native-only package profiles

These are private BeadHue repackagings of the official Taro 4.2.1 npm archives,
not new upstream releases or security exemptions. `UPSTREAM.json` contains each
official archive URL/integrity, all original/maintained file hashes and the
committed archive integrity. The original license is preserved. The API archive
does not include a license file; the same release's official React-plugin
archive supplies the repository's O2Team license, copied without changes.

Only the package metadata and public `index.js` entry change:

- React plugin: remove the unused Vite, Vite React and Vite Preact optional
  peers. The entry rejects any target/compiler other than `weapp`/`webpack5`.
  Every file in `dist/`, including the native runtime, remains byte-identical.
- API package: remove the optional H5 `webpack-dev-server` peer. Its public
  entry rejects targets other than `weapp` before running the original entry.
  All public types and other runtime files remain byte-identical.

The project's native React 18 alias, compiler and all algorithm/business logic
are unchanged. These archives are **not supported for H5, Vite or other Taro
targets**. No incompatible Vite version is forced into Taro's old peer range.
The actual native production/watch compiler graph is checked on every build.

Why an archive: a `file:` directory link changes Node's physical lookup base
to `vendor/`, which can resolve Web React 19. The committed `file:*.tgz` packages
are extracted into normal npm package locations with normal peer validation.
Ordinary `npm install` and `npm ci` never run a patching lifecycle script.

To reproduce, run `node scripts/build-native-taro-vendor.cjs` (Node 22, npm and
tar). It fetches only the two pinned official archives, verifies SHA-512 before
extracting, applies the visible entry guards/peer changes, and runs `npm pack
--ignore-scripts`. Re-run the dependency security suite, both type checks,
native production/watch builds and module gates after regeneration. New Taro
releases require an explicit compatibility review before replacing these files.

This removes unused vulnerable compiler paths, not vulnerabilities in the
native runtime. The separately maintained braces fix supplies recursion/cycle
guards for tools that actually run in the native compilation pipeline. The
unchanged full production audit remains the release gate.
