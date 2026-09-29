import "./platform/polyfills";
import { useLaunch, useDidHide } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { loadFonts } from "./platform/fonts";
import { cancelTask } from "./platform/worker";
import "./generated/tokens.css";
import "./app.css";
export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    void loadFonts().catch(() => {
      /* Explicit font readiness is shown on export/help; local tools remain usable. */
    });
  });
  useDidHide(cancelTask);
  return children;
}
