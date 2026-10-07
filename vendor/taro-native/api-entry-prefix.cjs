if (process.env.TARO_ENV !== 'weapp') {
  throw new Error('BeadHue native Taro API package supports only weapp; H5 is not included.');
}
