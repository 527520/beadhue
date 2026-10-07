import { Image, ScrollView, Text, View } from "@tarojs/components";
import { useState } from "react";
import { Shell } from "../../components/shell";
import { Chip, Empty, Search, go } from "../../components/ui";
import { examples } from "../../examples";
export default function Discover() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const items = examples.filter(
    (item) =>
      (category === "全部" || item.category === category) &&
      item.name.includes(query),
  );
  return (
    <Shell title="豆色绘" nav="discover">
      <View className="content">
        <Search value={query} onChange={setQuery} placeholder="搜索工具示例" />
        <ScrollView scrollX className="chips">
          {["全部", "动物", "美食", "自然"].map((c) => (
            <Chip
              key={c}
              active={c === category}
              onClick={() => setCategory(c)}
            >
              {c}
            </Chip>
          ))}
        </ScrollView>
        <View className="between" style={{ marginBottom: 16 }}>
          <Text className="title2">发现拼豆的乐趣</Text>
          <Text className="caption">自有创作示例</Text>
        </View>
        {!items.length ? (
          <Empty title="没有找到示例" detail="换个关键词试试" />
        ) : (
          <View className="grid2">
            {items.map((item) => (
              <View
                className="card"
                key={item.id}
                onClick={() => go(`/creation/example/index?id=${item.id}`)}
              >
                <View className="card-square">
                  <Image
                    className="card-image"
                    src={item.image}
                    mode="aspectFit"
                  />
                </View>
                <Text className="card-title">{item.name}</Text>
                <Text className="card-meta">
                  {item.category} · 图片处理示例
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Shell>
  );
}
