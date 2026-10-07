import { Canvas, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useContext, useEffect, useRef } from "react";
import { drawPattern, fitPattern } from "@beadhue/core/beads";
import type { Pattern } from "@beadhue/core/types";
import { canvasSurface } from "../platform/canvas";
import { report } from "./ui";
import { PageReadyContext } from "./shell";
let counter = 0;
export function PatternPreview({
  pattern,
  height = 220,
}: {
  pattern: Pattern;
  height?: number;
}) {
  const pageReady = useContext(PageReadyContext);
  const id = useRef(`pattern-${++counter}`);
  useEffect(() => {
    if (!pageReady) return;
    let closed = false;
    let cancelFrame: (() => void) | undefined;
    void canvasSurface(id.current)
      .then(({ node, width, height }) => {
        if (closed) return;
        const dpr = Math.min(Taro.getWindowInfo().pixelRatio, 2);
        if (node.width !== width * dpr) node.width = width * dpr;
        if (node.height !== height * dpr) node.height = height * dpr;
        const request = node.requestAnimationFrame(() => {
          if (closed) return;
          const ctx = node.getContext(
            "2d",
          ) as unknown as CanvasRenderingContext2D;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = "#F7F7F8";
          ctx.fillRect(0, 0, width, height);
          drawPattern(ctx, pattern, {
            ...fitPattern(pattern, { width, height }),
            mode: "bead",
          });
        });
        cancelFrame = () => node.cancelAnimationFrame(request);
      })
      .catch((error) => {
        if (!closed) report(error);
      });
    return () => {
      closed = true;
      cancelFrame?.();
    };
  }, [pageReady, pattern, height]);
  return pageReady ? (
    <Canvas
      type="2d"
      id={id.current}
      canvasId={id.current}
      style={{ width: "100%", height }}
    />
  ) : (
    <View style={{ width: "100%", height }} />
  );
}
