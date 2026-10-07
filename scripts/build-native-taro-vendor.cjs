// Maintenance-only generator. Normal npm install/ci uses the committed archives
// and never downloads, patches or executes this script. Requires npm and tar.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'vendor/taro-native');
const definitions = [
  {
    upstream: '@tarojs/plugin-framework-react', name: '@beadhue/taro-react-webpack',
    tarball: 'https://registry.npmjs.org/@tarojs/plugin-framework-react/-/plugin-framework-react-4.2.1.tgz',
    integrity: 'sha512-+ZOpFIkdb75eWbFkRbFz81R9qHp/sUgfr4UPZCntaxvUXyAZrCjcYd6IsGLjg/563WG/BjRS0tdkEnmp8bOnPQ==',
    removedPeers: ['vite', '@vitejs/plugin-react', '@preact/preset-vite'],
  },
  {
    upstream: '@tarojs/taro', name: '@beadhue/taro-api-weapp',
    tarball: 'https://registry.npmjs.org/@tarojs/taro/-/taro-4.2.1.tgz',
    integrity: 'sha512-xH8vHwrydO8YonwhEcQ1E61wvm5c5NevLKXQUTSYjze0lu0D4WqH9qSjEiCCIHtZ6KTJ/2Cvs8/murq14Z//IQ==',
    removedPeers: ['webpack-dev-server'],
  },
];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function hashes(directory, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(directory, file));
    else result[file] = sha256(fs.readFileSync(path.join(directory, file)));
  }
  return result;
}

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'beadhue-taro-vendor-'));
  const records = [];
  let license;
  try {
    for (const [index, definition] of definitions.entries()) {
      const response = await fetch(definition.tarball);
      if (!response.ok) throw new Error(`Upstream fetch failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const integrity = 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
      if (integrity !== definition.integrity) throw new Error(`Upstream integrity mismatch: ${definition.upstream}`);
      const stage = path.join(temporary, String(index));
      fs.mkdirSync(stage);
      const archive = path.join(stage, 'upstream.tgz');
      fs.writeFileSync(archive, bytes);
      execFileSync('tar', ['-xzf', archive, '-C', stage]);
      const directory = path.join(stage, 'package');
      const originalSha256 = hashes(directory);
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
      if (manifest.name !== definition.upstream || manifest.version !== '4.2.1') throw new Error('Unexpected upstream package');
      if (index === 0) license = fs.readFileSync(path.join(directory, 'LICENSE'));
      // The API tarball omits LICENSE; preserve the same official release's
      // repository license from the verified React-plugin tarball.
      fs.writeFileSync(path.join(directory, 'LICENSE'), license);
      manifest.name = definition.name;
      manifest.version = '4.2.1-beadhue.1';
      manifest.private = true;
      delete manifest.devDependencies;
      delete manifest.scripts;
      for (const peer of definition.removedPeers) {
        delete manifest.peerDependencies[peer];
        delete manifest.peerDependenciesMeta[peer];
      }
      const originalEntry = fs.readFileSync(path.join(directory, 'index.js'), 'utf8');
      const entry = index === 0
        ? fs.readFileSync(path.join(output, 'framework-entry.cjs'), 'utf8')
        : fs.readFileSync(path.join(output, 'api-entry-prefix.cjs'), 'utf8') + '\n' + originalEntry;
      fs.writeFileSync(path.join(directory, 'index.js'), entry);
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
      const pack = JSON.parse(execFileSync('npm', ['pack', directory, '--ignore-scripts', '--json', '--pack-destination', output], { encoding: 'utf8' }))[0];
      records.push({ ...definition, upstreamVersion: '4.2.1', version: manifest.version, archive: pack.filename, archiveIntegrity: pack.integrity, originalSha256, maintainedSha256: hashes(directory) });
    }
    fs.writeFileSync(path.join(output, 'LICENSE'), license);
    fs.writeFileSync(path.join(output, 'UPSTREAM.json'), JSON.stringify(records, null, 2) + '\n');
    console.log(records.map(({ upstream, archive, archiveIntegrity }) => ({ upstream, archive, archiveIntegrity })));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
