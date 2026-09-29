import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { Shell } from "../../components/shell";
import {
  Button,
  Empty,
  Notice,
  confirm,
  go,
  perform,
} from "../../components/ui";
import { privateImage, request, session } from "../../platform/network";
import { synchronize } from "../../platform/designs";
interface Original {
  designId: string;
  name: string;
  revision: number;
  byteSize: number;
  width: number;
  height: number;
}
export default function Originals() {
  const [items, setItems] = useState<Original[]>([]),
    [usage, setUsage] = useState<{ bytes: number; quotaBytes: number } | null>(
      null,
    );
  async function refresh() {
    setItems(
      (await request<{ items: Original[] }>("/api/originals/designs")).items,
    );
    setUsage(await request("/api/originals/usage"));
  }
  useDidShow(() => {
    if (session()?.emailVerified) void perform(refresh);
  });
  return (
    <Shell title="私人原图空间" back>
      <View className="content stack">
        {!session()?.emailVerified ? (
          <Empty
            title="登录后管理原图空间"
            action={
              <Button onClick={() => go("/account/settings/index")}>
                登录账号
              </Button>
            }
          />
        ) : (
          <>
            <Notice>
              {usage
                ? `已用 ${(usage.bytes / 1048576).toFixed(1)} MB / ${(usage.quotaBytes / 1048576).toFixed(0)} MB`
                : "正在读取空间用量"}
            </Notice>
            {items.map((item) => (
              <View className="panel stack" key={item.designId}>
                <Text className="title3">{item.name}</Text>
                <Text className="caption">
                  {item.width} × {item.height} ·{" "}
                  {(item.byteSize / 1048576).toFixed(1)} MB
                </Text>
                <View className="row">
                  <Button
                    secondary
                    onClick={() =>
                      void perform(async () => {
                        const path = await privateImage(
                          `/api/designs/${item.designId}/original`,
                        );
                        await Taro.previewImage({ urls: [path] });
                      })
                    }
                  >
                    查看
                  </Button>
                  <Button
                    secondary
                    onClick={() =>
                      void perform(async () => {
                        if (
                          !(await confirm(
                            "删除云端原图",
                            "图纸仍保留。请确认已备份原图。",
                          ))
                        )
                          return;
                        await request(
                          `/api/designs/${item.designId}/original`,
                          {
                            method: "DELETE",
                            data: { baseRevision: item.revision },
                          },
                        );
                        await synchronize();
                        await refresh();
                      })
                    }
                  >
                    删除原图
                  </Button>
                </View>
              </View>
            ))}
            {!items.length && (
              <Empty
                title="尚无云端原图"
                detail="在「我的」同步设计与原图后，可在这里管理。"
              />
            )}
          </>
        )}
      </View>
    </Shell>
  );
}
