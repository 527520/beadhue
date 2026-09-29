let loaded: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    if (!ASSET_BASE_URL.startsWith('https://')) throw new Error('字体资源尚未配置');
    await Promise.all([400,500,600,700].map(weight=>new Promise<void>((resolve,reject)=>wx.loadFontFace({
      family:'BeadHue Text',source:`url("${ASSET_BASE_URL}/fonts/weapp/text-${weight}.woff")`,global:true,desc:{weight:String(weight)},
      ...{scopes:['webview','native']},success:()=>resolve(),fail:reject,
    }))));
  })().catch(error => { loaded = null; throw error; });
  return loaded;
}
