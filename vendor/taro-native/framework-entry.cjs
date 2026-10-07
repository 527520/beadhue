module.exports = ctx => {
  const configured = ctx.initialConfig.compiler;
  const compiler = typeof configured === 'string' ? configured : configured?.type;
  if (process.env.TARO_ENV !== 'weapp' || compiler !== 'webpack5') {
    throw new Error('BeadHue native Taro React adapter supports only webpack5/weapp; H5 and Vite are not included.');
  }
  return require('./dist/index.js').default(ctx);
};
module.exports.default = module.exports;
