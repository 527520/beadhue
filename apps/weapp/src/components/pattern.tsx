import { Canvas } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef } from "react";
import { drawPattern, fitPattern } from "@beadhue/core/beads";
import type { Pattern } from "@beadhue/core/types";
let counter = 0;
export function PatternPreview({
  pattern,
  height = 220,
}: {
  pattern: Pattern;
  height?: number;
}) {
  const id = useRef(`pattern-${++counter}`);
  useEffect(() => {
    let closed = false;
    void Taro.nextTick(() => {
      wx.createSelectorQuery()
        .select(`#${id.current}`)
        .fields({ node: true, size: true })
        .exec(
          (
            rows: Array<{
              node?: WechatMiniprogram.Canvas;
              width: number;
              height: number;
            }>,
          ) => {
            if (closed || !rows[0]?.node) return;
            const { node, width, height } = rows[0];
            const dpr = Math.min(Taro.getWindowInfo().pixelRatio, 2);
            node.width = width * dpr;
            node.height = height * dpr;
            const ctx = node.getContext(
              "2d",
            ) as unknown as CanvasRenderingContext2D;
            ctx.scale(dpr, dpr);
            ctx.fillStyle = "#F7F7F8";
            ctx.fillRect(0, 0, width, height);
            drawPattern(ctx, pattern, {
              ...fitPattern(pattern, { width, height }),
              mode: "bead",
            });
          },
        );
    });
    return () => {
      closed = true;
    };
  }, [pattern, height]);
  return <Canvas type="2d" id={id.current} style={{ width: "100%", height }} />;
}
