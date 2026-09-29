import { Image, Text, View } from "@tarojs/components";
import { useRouter } from "@tarojs/taro";
import { Shell } from "../../components/shell";
import { Button, Empty, go } from "../../components/ui";
import { examples } from "../../examples";
export default function Example() {
  const { params } = useRouter();
  const example = examples.find((e) => e.id === params.id);
  return (
    <Shell title="工具示例" back>
      {example ? (
        <View className="content stack">
          <Image
            className="sample-image"
            src={example.image}
            mode="aspectFit"
          />
          <Text className="title1">{example.name}</Text>
          <Text>{example.description}</Text>
          <Text className="muted">豆色绘自有教学素材 · {example.category}</Text>
          <View className="panel">
            选择色板、图纸尺寸和制作规格后生成独立私人设计。用色和尺寸随您的生成参数实时计算。
          </View>
          <Button
            onClick={() => go(`/creation/entry/index?example=${example.id}`)}
          >
            用此示例创作
          </Button>
        </View>
      ) : (
        <Empty title="示例不存在" />
      )}
    </Shell>
  );
}
