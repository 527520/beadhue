import { Button as NativeButton, Text, View } from "@tarojs/components";
import Taro, { useDidShow, useDidHide } from "@tarojs/taro";
import { useRef, useState } from "react";
import { Sheet, Button } from "./ui";
// Official privacy API's first callback parameter is a resolver (upstream typings lag).
const onPrivacy = wx.onNeedPrivacyAuthorization as unknown as (
  callback: (resolve: Resolve) => void,
) => void;
type Resolve = (value: {
  event: "agree" | "disagree";
  buttonId?: string;
}) => void;
export function Privacy() {
  const pending = useRef<Resolve | null>(null);
  const [visible, setVisible] = useState(false);
  function finish(agree: boolean) {
    const resolve = pending.current;
    pending.current = null;
    setVisible(false);
    resolve?.(
      agree
        ? { event: "agree", buttonId: "privacy-agree" }
        : { event: "disagree" },
    );
  }
  useDidShow(() => {
    onPrivacy((resolve) => {
      pending.current?.({ event: "disagree" });
      pending.current = resolve;
      setVisible(true);
    });
  });
  useDidHide(() => finish(false));
  if (!visible) return null;
  return (
    <Sheet title="隐私保护提示" onClose={() => finish(false)}>
      <View className="stack">
        <Text>
          本次操作需要您同意隐私保护指引。所选图片用于生成您的私人图纸，保存相册只写入您主动导出的图片。
        </Text>
        <Button secondary onClick={() => void Taro.openPrivacyContract()}>
          阅读隐私保护指引
        </Button>
        <NativeButton
          id="privacy-agree"
          className="button"
          openType="agreePrivacyAuthorization"
          onAgreePrivacyAuthorization={() => finish(true)}
        >
          同意并继续本次操作
        </NativeButton>
        <Button secondary onClick={() => finish(false)}>
          暂不同意
        </Button>
        <Text className="caption">您仍可以使用不需要此权限的其他功能。</Text>
      </View>
    </Sheet>
  );
}
