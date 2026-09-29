import { Text, Textarea, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { Shell } from "../../components/shell";
import {
  Button,
  Chip,
  Field,
  Notice,
  Search,
  Sheet,
  confirm,
  perform,
} from "../../components/ui";
import { namespace } from "../../platform/designs";
import { getBuiltinPalette, listBuiltinPalettes } from "@beadhue/core/palettes";
import type { PaletteColor } from "@beadhue/core/types";
import {
  deletePalette,
  readPalettes,
  savePalette,
  syncPalettes,
  type PaletteRecord,
} from "../../platform/palettes";
export default function Palettes() {
  const [custom, setCustom] = useState<PaletteRecord[]>([]),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<{
      name: string;
      colors: readonly PaletteColor[];
    } | null>(null),
    [editing, setEditing] = useState<PaletteRecord | null | "new">(null),
    [name, setName] = useState(""),
    [text, setText] = useState(""),
    [notice, setNotice] = useState("");
  async function refresh() {
    const space = namespace();
    const values = (await readPalettes()).filter((p) => !p.deleted);
    if (space === namespace()) setCustom(values);
  }
  useDidShow(() => {
    setSelected(null);
    setEditing(null);
    void perform(refresh);
  });
  const builtin = listBuiltinPalettes().filter((p) => p.label.includes(search));
  return (
    <Shell title="色板" back>
      <View className="content stack">
        <Search value={search} onChange={setSearch} placeholder="搜索色板" />
        <View className="row">
          <Button
            onClick={() => {
              setEditing("new");
              setName("");
              setText("");
            }}
          >
            新建色板
          </Button>
          <Button
            secondary
            onClick={() =>
              void perform(async () => {
                await syncPalettes();
                await refresh();
                setNotice("色板同步完成，冲突版本保留为副本。");
              })
            }
          >
            同步自定义色板
          </Button>
        </View>
        {notice && <Notice>{notice}</Notice>}
        <Text className="title2">自定义色板</Text>
        {custom
          .filter((p) => p.name.includes(search))
          .map((p) => (
            <View key={p.id} className="panel stack">
              <View className="between">
                <Text className="title3" onClick={() => setSelected(p)}>
                  {p.name}
                </Text>
                <Text className="caption">
                  {p.colors.length} 色 · {p.dirty ? "待同步" : "已同步"}
                </Text>
              </View>
              <View className="row">
                <Chip onClick={() => setSelected(p)}>浏览</Chip>
                <Chip
                  onClick={() => {
                    setEditing(p);
                    setName(p.name);
                    setText(
                      p.colors.map((c) => `${c.code},${c.hex}`).join("\n"),
                    );
                  }}
                >
                  编辑
                </Chip>
                <Chip
                  onClick={() =>
                    void perform(async () => {
                      if (
                        await confirm(
                          "删除色板",
                          "已有设计保留其颜色定义。删除将在下次同步时提交。",
                        )
                      ) {
                        await deletePalette(p.id);
                        await refresh();
                      }
                    })
                  }
                >
                  删除
                </Chip>
              </View>
            </View>
          ))}
        <Text className="title2">内置色板</Text>
        {builtin.map((p) => (
          <View
            className="action-row"
            key={p.id}
            onClick={() => {
              const palette = getBuiltinPalette(p.id);
              setSelected({ name: p.label, colors: palette.colors });
            }}
          >
            <Text>{p.label}</Text>
            <Text>›</Text>
          </View>
        ))}
      </View>
      {selected && (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <View className="color-list">
            {selected.colors.map((c, i) => (
              <View className="color-item" key={i}>
                <View className="swatch" style={{ backgroundColor: c.hex }} />
                <Text className="caption">{c.code ?? "—"}</Text>
              </View>
            ))}
          </View>
        </Sheet>
      )}
      {editing && (
        <Sheet title="编辑自定义色板" onClose={() => setEditing(null)}>
          <Field label="色板名称" value={name} onChange={setName} />
          <Text className="caption">每行填写 色号,#RRGGBB，最多 500 色。</Text>
          <Textarea
            value={text}
            onInput={(e) => setText(e.detail.value)}
            maxlength={20000}
            style={{
              width: "100%",
              height: 220,
              border: "1px solid #E7E7EA",
              padding: 12,
              marginTop: 12,
            }}
          />
          <Button
            onClick={() =>
              void perform(async () => {
                const colors = text
                  .split(/\n/)
                  .filter((l) => l.trim())
                  .map((line) => {
                    const [code, hex] = line.split(/[,，\s]+/);
                    return { code, hex };
                  });
                await savePalette({
                  id: editing === "new" ? undefined : editing.id,
                  name,
                  colors,
                });
                setEditing(null);
                await refresh();
              })
            }
          >
            保存到本机
          </Button>
        </Sheet>
      )}
    </Shell>
  );
}
