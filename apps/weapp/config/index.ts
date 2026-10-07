import { defineConfig } from "@tarojs/cli";
import path from "node:path";

const defaultOrigin = "https://beadhue.com";

export default defineConfig<"webpack5">({
  projectName: "beadhue-weapp",
  date: "2026-09-29",
  designWidth: 375,
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  plugins: ["@tarojs/plugin-platform-weapp"],
  alias: { "@": path.resolve(__dirname, "../../../src") },
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.WEAPP_API_BASE_URL ?? defaultOrigin),
    ASSET_BASE_URL: JSON.stringify(process.env.WEAPP_ASSET_BASE_URL ?? defaultOrigin),
    WEBSITE_URL: JSON.stringify(process.env.WEAPP_WEBSITE_URL ?? defaultOrigin),
  },
  copy: { patterns: [{ from: "src/assets", to: "dist/assets" }, { from: ".workers", to: "dist/workers" }], options: {} },
  mini: {
    compile: { include: [path.resolve(__dirname, "../../../src"), path.resolve(__dirname, "../../../packages")] },
    postcss: { pxtransform: { enable: false }, url: { enable: false } },
    webpackChain(chain: {
      resolve: { alias: { set(key: string, value: string): unknown } };
    }) {
      // Resolve React from this workspace, never the Web application's React 19.
      chain.resolve.alias.set(
        "react",
        path.resolve(__dirname, "../node_modules/react"),
      );
      chain.resolve.alias.set(
        "react-dom",
        path.resolve(__dirname, "../node_modules/react-dom"),
      );
    },
  },
});
