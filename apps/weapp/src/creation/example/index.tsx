import { Text, View } from "@tarojs/components";
import { useRouter } from "@tarojs/taro";
import { Shell } from "../../components/shell";
import { Button, Empty, go } from "../../components/ui";
import { PatternPreview } from "../../components/pattern";
import { examples } from "../../examples";
import { computeStats, totalBeadCount } from "@beadhue/core/generation";
import { getBoardProfile } from "@beadhue/core/boards";
import type { PatternCell } from "@beadhue/core/types";
import patterns from "./patterns.json";
export default function Example() {
  const { params } = useRouter();
  const example = examples.find((e) => e.id === params.id);
  const data = example && patterns[example.id];
  const pattern = data && {
    width: data.width,
    height: data.height,
    cells: data.indices.map((i) => data.colors[i] as PatternCell),
  };
  const stats = pattern ? computeStats(pattern.cells) : [];
  const board = getBoardProfile("5mm-29");
  return (
    <Shell title="工具示例" back>
      {example && pattern ? (
        <View className="content stack">
          <PatternPreview pattern={pattern} height={280} />
          <Text className="title1">{example.name}</Text>
          <Text>{example.description}</Text>
          <Text className="muted">豆色绘自有教学素材 · {example.category}</Text>
          <View className="panel stack">
            <Text className="title3">
              {pattern.width} × {pattern.height} 格 · {stats.length} 色 ·{" "}
              {totalBeadCount(stats)} 颗
            </Text>
            <Text>制作规格：{board.displayName} · MARD 色板</Text>
            <Text>
              底板：{Math.ceil(pattern.width / board.boardCols)} ×{" "}
              {Math.ceil(pattern.height / board.boardRows)} 块
            </Text>
            <View className="color-list">
              {stats.map((color) => (
                <View className="color-item" key={color.code}>
                  <View
                    className="swatch"
                    style={{ backgroundColor: color.hex }}
                  />
                  <Text className="caption">{color.code}</Text>
                  <Text className="caption">{color.count} 颗</Text>
                </View>
              ))}
            </View>
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
