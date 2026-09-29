import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { PropsWithChildren, ReactNode } from "react";
import { Privacy } from "./privacy";
import { Icon, IconButton, go } from "./ui";
export function Shell({
  title,
  nav,
  back,
  action,
  children,
}: PropsWithChildren<{
  title: string;
  nav?: "discover" | "mine";
  back?: boolean;
  action?: ReactNode;
}>) {
  const info = Taro.getWindowInfo();
  const capsule = Taro.getMenuButtonBoundingClientRect();
  const top = Math.max(info.statusBarHeight ?? 0, capsule.top - 8);
  const right = Math.max(16, info.windowWidth - capsule.left + 8);
  return (
    <View
      className={`shell ${nav ? "has-tabbar" : ""}`}
      style={
        {
          "--safe-bottom": `${Math.max(0, info.screenHeight - (info.safeArea?.bottom ?? info.screenHeight))}px`,
        } as React.CSSProperties
      }
    >
      <View className="topbar" style={{ paddingTop: top }}>
        <View className="topbar-content" style={{ paddingRight: right }}>
          {back && (
            <IconButton
              name="ChevronLeft"
              label="返回"
              onClick={() => void Taro.navigateBack()}
            />
          )}
          {nav === "discover" ? (
            <Image
              src="/assets/brand.svg"
              mode="widthFix"
              style={{ width: 90, height: 24 }}
            />
          ) : (
            <Text className="topbar-title">{title}</Text>
          )}
          {action}
        </View>
      </View>
      {children}
      <Privacy />
      {nav && (
        <View className="tabbar">
          <View
            className={nav === "discover" ? "tab active" : "tab"}
            onClick={() =>
              void Taro.redirectTo({ url: "/pages/discover/index" })
            }
          >
            <Icon name="Compass" />
            <Text>发现</Text>
          </View>
          <View
            className="create-fab"
            onClick={() => go("/creation/entry/index")}
          >
            <Text>＋</Text>
          </View>
          <View
            className={nav === "mine" ? "tab active" : "tab"}
            onClick={() => void Taro.redirectTo({ url: "/pages/mine/index" })}
          >
            <Icon name="User" />
            <Text>我的</Text>
          </View>
        </View>
      )}
    </View>
  );
}
