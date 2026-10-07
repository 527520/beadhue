import Taro from "@tarojs/taro";

export interface CanvasSurface {
  node: WechatMiniprogram.Canvas;
  width: number;
  height: number;
}

export function createDecodeCanvas(): WechatMiniprogram.Canvas {
  return wx.createOffscreenCanvas({
    type: "2d",
    width: 1,
    height: 1,
  }) as unknown as WechatMiniprogram.Canvas;
}

/** React can commit before WeChat attaches the native Canvas node. Capture the
 * page and wait for its surface, without accidentally querying a later page. */
export async function canvasSurface(id: string): Promise<CanvasSurface> {
  const page = Taro.getCurrentInstance().page;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise<void>((resolve) => Taro.nextTick(resolve));
    const surface = await new Promise<CanvasSurface | undefined>((resolve) => {
      const query = wx.createSelectorQuery();
      if (page)
        query.in(
          page as unknown as WechatMiniprogram.Component.TrivialInstance,
        );
      query
        .select(`#${id}`)
        .fields({ node: true, size: true })
        .exec((rows: CanvasSurface[]) => {
          const row = rows[0];
          resolve(
            row?.node && row.width > 0 && row.height > 0 ? row : undefined,
          );
        });
    });
    if (surface) return surface;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("画布尚未准备好，请重试");
}

export async function canvasNode(
  id: string,
): Promise<WechatMiniprogram.Canvas> {
  return (await canvasSurface(id)).node;
}
