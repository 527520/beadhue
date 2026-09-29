// WeChat supports workers subpackages; Taro AppConfig still types workers as string[].
export default {
  pages: ["pages/discover/index", "pages/mine/index"],
  subPackages: [
    {
      root: "creation",
      pages: ["entry/index", "editor/index", "example/index", "palettes/index"],
    },
    {
      root: "account",
      pages: ["settings/index", "help/index", "originals/index"],
    },
    { root: "export", pages: ["output/index"] },
  ],
  workers: { path: "workers", isSubpackage: true },
  window: {
    navigationStyle: "custom",
    backgroundColor: "#F7F7F8",
    backgroundTextStyle: "dark",
  },
  lazyCodeLoading: "requiredComponents",
  permission: {
    "scope.writePhotosAlbum": { desc: "保存您主动导出的拼豆图纸到相册" },
  },
};
