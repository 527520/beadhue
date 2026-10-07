const fs = require('node:fs');
const path = require('node:path');

const name = 'BeadHueNativeDependencyBoundary';
const root = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(root, '.scratch/wechat-miniprogram/evidence');
const normalize = file => path.relative(root, file.split('?')[0]).split(path.sep).join('/');
const forbiddenClient = /(?:^|\/)node_modules\/(?:vite|@vitejs\/plugin-react|webpack(?:-dev-server|-dev-middleware)?|swiper|braces|micromatch|chokidar|node-forge|@tarojs\/helper)\//;
const forbiddenBuild = /(?:^|\/)node_modules\/(?:vite|@vitejs\/plugin-react|webpack-dev-server|webpack-dev-middleware|swiper|node-forge)\//;

class NativeDependencyBoundary {
  constructor(prebundle) {
    this.prebundle = prebundle;
  }

  apply(compiler) {
    let resources = [];
    let rejected = [];
    compiler.hooks.thisCompilation.tap(name, compilation => {
      compilation.hooks.finishModules.tap(name, modules => {
        // This is the actual resolved module graph, before concatenation and
        // minification; matching words in generated JS would confuse native
        // <swiper> element names with the unrelated H5 Swiper npm package.
        resources = [...new Set([...modules].filter(module => module.resource).map(module => normalize(module.resource)))].sort();
        rejected = resources.filter(file => forbiddenClient.test(file) || file.startsWith('vendor/braces/'));
        if (rejected.length) compilation.errors.push(new compiler.webpack.WebpackError(`Native client imports build/H5 dependencies: ${rejected.join(', ')}`));
      });
    });
    compiler.hooks.done.tap(name, stats => {
      // Taro's native runner is CommonJS. Confirm it did not start the H5/Vite
      // service path either. No environment values or webpack config are saved.
      const rejectedBuildLoads = Object.keys(require.cache).map(normalize).filter(file => forbiddenBuild.test(file)).sort();
      const report = {
        webpackVersion: compiler.webpack.version,
        watch: compiler.watchMode === true,
        moduleCount: resources.length,
        resources,
        prebundleObserved: this.prebundle.observed,
        prebundleResources: this.prebundle.resources,
        rejectedPrebundleModules: this.prebundle.rejected,
        rejectedClientModules: rejected,
        rejectedBuildLoads,
        passed: !stats.hasErrors() && rejected.length === 0 && rejectedBuildLoads.length === 0 && this.prebundle.rejected.length === 0,
      };
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, `module-boundaries-${report.watch ? 'watch' : 'build'}.json`), JSON.stringify(report, null, 2) + '\n');
      if (rejectedBuildLoads.length) throw new Error(`Native compiler loaded an H5/Vite-only dependency: ${rejectedBuildLoads.join(', ')}`);
      if (this.prebundle.rejected.length) throw new Error(`Native prebundle imports build/H5 dependencies: ${this.prebundle.rejected.join(', ')}`);
      if (!stats.hasErrors()) console.log(`Native dependency boundary checked (${resources.length} resolved modules).`);
    });
  }
}

module.exports = ctx => {
  const prebundle = { observed: false, resources: [], rejected: [] };
  ctx.modifyRunnerOpts(({ opts }) => {
    if (typeof opts.compiler === 'string') opts.compiler = { type: opts.compiler };
    if (opts.compiler?.type !== 'webpack5') return;
    const settings = opts.compiler.prebundle ||= {};
    // A verification run rebuilds the dependency cache so its metafile can be
    // inspected. Ordinary watch keeps Taro's existing caching behavior; the
    // report explicitly distinguishes a cache hit from observed source inputs.
    if (process.env.WEAPP_VERIFY_PREBUNDLE === '1') settings.force = true;
    const esbuild = settings.esbuild ||= {};
    const plugins = esbuild.plugins ||= [];
    plugins.push({
      name: 'beadhue-native-prebundle-boundary',
      setup(build) {
        build.onEnd(result => {
          prebundle.observed = true;
          prebundle.resources = Object.keys(result.metafile?.inputs || {}).map(file => normalize(path.isAbsolute(file) ? file : path.resolve(__dirname, '..', file))).sort();
          prebundle.rejected = prebundle.resources.filter(file => forbiddenClient.test(file) || file.startsWith('vendor/braces/'));
          if (prebundle.rejected.length) return { errors: [{ text: `Native prebundle imports forbidden dependencies: ${prebundle.rejected.join(', ')}` }] };
        });
      },
    });
  });
  ctx.modifyWebpackChain(({ chain }) => {
    chain.plugin(name).use(NativeDependencyBoundary, [prebundle]);
  });
};
