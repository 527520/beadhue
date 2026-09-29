import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { Shell } from "../../components/shell";
import { Button, Notice, perform } from "../../components/ui";
import { loadFonts } from "../../platform/fonts";
export default function Help() {
  const [copyFailed, setCopyFailed] = useState(false),
    [font, setFont] = useState("");
  return (
    <Shell title="帮助与关于" back>
      <View className="content stack">
        <Text className="title1">把喜欢的画面，一颗颗拼出来。</Text>
        <View className="panel stack">
          <Text className="title2">开始创作</Text>
          <Text>1. 选择照片、自有示例或空白画布。</Text>
          <Text>2. 调整宽度、色板与制作规格，生成预览。</Text>
          <Text>
            3. 用画笔拖动对准格子，松手完成一次修改；双指只移动与缩放。
          </Text>
          <Text>4. 进入跟拼，逐格或逐行记录；进度只保存在本机。</Text>
          <Text>5. 导出图纸或项目文件；项目可以在 Web 继续编辑。</Text>
        </View>
        <View className="panel stack">
          <Text className="title2">私人数据与权限</Text>
          <Text>
            游客设计保存在当前设备。开启云同步需要登录已验证邮箱账号；原图上传占用同一账号空间。不同账号的数据独立保存，游客设计迁入由您确认。
          </Text>
          <Text>
            仅在您点击选图或保存相册时申请相应权限。拒绝某项权限不会阻止其他工具功能。清除微信小程序数据可能删除尚未同步的设计，请定期导出项目备份。
          </Text>
          <Button
            secondary
            onClick={() =>
              void Taro.openPrivacyContract({
                fail: () =>
                  void Taro.showToast({
                    title: "平台隐私指引尚未配置",
                    icon: "none",
                  }),
              })
            }
          >
            查看平台隐私保护指引
          </Button>
        </View>
        <View className="panel stack">
          <Text className="title2">网页版功能</Text>
          <Text>
            网页版还提供作品交流功能。小程序专注私人创作，您可以复制网站地址后在浏览器访问。
          </Text>
          <Button
            onClick={() =>
              void perform(async () => {
                if (!/^https:\/\//.test(WEBSITE_URL))
                  throw new Error("网站地址尚未配置");
                try {
                  await Taro.setClipboardData({ data: WEBSITE_URL });
                  await Taro.showToast({
                    title: "地址已复制，请打开浏览器粘贴访问",
                    icon: "none",
                  });
                } catch {
                  setCopyFailed(true);
                }
              })
            }
          >
            复制网站地址
          </Button>
          {copyFailed && <Text selectable>{WEBSITE_URL}</Text>}
        </View>
        <Text className="title2">开源与素材</Text>
        <Text className="muted">
          豆色绘 BeadHue · 个人工具版。项目采用
          AGPL-3.0；内置色板来源及许可见项目 NOTICE。界面字体 Noto Sans SC 和
          ChillRound，图标 Lucide；首页为仓库自有示例，无公开投稿入口。
        </Text>
        <Text selectable className="caption">
          https://github.com/527520/beadhue
        </Text>
        <Button
          secondary
          onClick={() =>
            void perform(async () => {
              await loadFonts();
              setFont(
                "正文和 Canvas 字体加载成功；字形与排版仍以实际设备显示为准。",
              );
            })
          }
        >
          检查字体加载
        </Button>
        {font && <Notice>{font}</Notice>}
      </View>
    </Shell>
  );
}
