const fs = require('node:fs');
const path = require('node:path');

const blocked = /(?:^|\/)node_modules\/(?:@tarojs\/[^/]+|@beadhue\/(?:taro-api-weapp|taro-react-webpack|braces)|vite|@vitejs\/plugin-react|webpack-dev-server|webpack-dev-middleware|swiper|braces|micromatch|chokidar|node-forge)(?:\/|$)|(?:^|\/)vendor\/(?:braces|taro-native)(?:\/|$)/;

function checkStandaloneBoundary(directory) {
  const root = fs.realpathSync(directory);
  const visited = new Set();
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const relative = path.relative(root, current).split(path.sep).join('/');
    if (blocked.test(relative)) throw new Error(`Standalone includes native/build dependency: ${relative}`);
    const real = fs.realpathSync(current);
    if (visited.has(real)) continue;
    visited.add(real);
    if (fs.statSync(real).isDirectory()) {
      for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry));
    }
  }
  return visited.size;
}

if (require.main === module) {
  const count = checkStandaloneBoundary(path.resolve('.next/standalone'));
  console.log(`Standalone dependency boundary checked (${count} paths).`);
}

module.exports = { checkStandaloneBoundary };
