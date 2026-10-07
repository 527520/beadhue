import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { Shell } from "../../components/shell";
import {
  Button,
  Chip,
  Empty,
  IconButton,
  Notice,
  Search,
  Sheet,
  confirm,
  go,
  perform,
  promptText,
} from "../../components/ui";
import { PatternPreview } from "../../components/pattern";
import { parseStoredProject, type DesignRecord } from "@beadhue/core/storage";
import { designNameSchema } from "@beadhue/core/schemas";
import {
  newId,
  saveDesign,
  storage,
  syncClient,
  synchronize,
  namespace,
} from "../../platform/designs";
import { session } from "../../platform/network";
import { synchronizeOriginals } from "../../platform/originals";
export default function Mine() {
  const [records, setRecords] = useState<DesignRecord[]>([]),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState<"recent" | "name">("recent"),
    [selected, setSelected] = useState<DesignRecord | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const refresh = async () => {
    const space = namespace();
    const values = await storage().getAll();
    if (space === namespace()) setRecords(values);
  };
  useDidShow(() => {
    setSelected(null);
    setStatus("");
    void perform(refresh);
  });
  const s = session();
  const items = records
    .filter((r) => r.name.includes(query))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  async function sync() {
    if (!s?.emailVerified) {
      go("/account/settings/index");
      return;
    }
    setBusy(true);
    try {
      const result = await synchronize();
      if (session()?.token !== s.token) return;
      const originals = await synchronizeOriginals();
      if (session()?.token !== s.token) return;
      setStatus(
        result.errors.length
          ? `部分设计待重试：${result.errors.join("；")}`
          : `已同步 · 上传 ${result.pushed}，下载 ${result.pulled}${result.conflictCopies.length ? `，保留 ${result.conflictCopies.length} 份冲突副本` : ""}${originals.length ? `；原图待重试：${originals.join("；")}` : ""}`,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell
      title="我的"
      nav="mine"
      action={
        <IconButton
          name="Settings"
          label="账号设置"
          onClick={() => go("/account/settings/index")}
        />
      }
    >
      <View className="content stack">
        <View className="between">
          <View>
            <Text className="title1">
              {s?.emailVerified ? s.email : "我的创作空间"}
            </Text>
            <Text className="muted">
              {s?.emailVerified
                ? "私人设计 · 两端接续创作"
                : "游客模式 · 设计保存在当前设备"}
            </Text>
          </View>
          <IconButton
            name="CircleHelp"
            label="帮助"
            onClick={() => go("/account/help/index")}
          />
        </View>
        <View className="row wrap">
          <Button loading={busy} secondary onClick={() => void perform(sync)}>
            {s?.emailVerified ? "同步设计与原图" : "登录并开启云同步"}
          </Button>
          <Button secondary onClick={() => go("/creation/palettes/index")}>
            我的色板
          </Button>
          <Button secondary onClick={() => go("/account/originals/index")}>
            原图空间
          </Button>
        </View>
        {status && <Notice>{status}</Notice>}
        <View className="between">
          <Text className="title2">私人设计</Text>
          <Text className="caption">{records.length} 份</Text>
        </View>
        <Search value={query} onChange={setQuery} placeholder="搜索我的设计" />
        <View className="row">
          <Chip active={sort === "recent"} onClick={() => setSort("recent")}>
            最近修改
          </Chip>
          <Chip active={sort === "name"} onClick={() => setSort("name")}>
            按名称
          </Chip>
        </View>
        {items.length ? (
          <View className="grid2">
            {items.map((record) => {
              const project = parseStoredProject(record.projectJson);
              return (
                <View className="card" key={record.id}>
                  <View
                    className="card-square"
                    onClick={() => go(`/creation/editor/index?id=${record.id}`)}
                  >
                    {project && (
                      <PatternPreview
                        pattern={project.pattern}
                        height={(Taro.getWindowInfo().windowWidth - 44) / 2}
                      />
                    )}
                  </View>
                  <View className="between">
                    <Text
                      className="card-title"
                      onClick={() =>
                        go(`/creation/editor/index?id=${record.id}`)
                      }
                    >
                      {record.name}
                    </Text>
                    <IconButton
                      name="MoreHorizontal"
                      label={`${record.name}更多操作`}
                      onClick={() => setSelected(record)}
                    />
                  </View>
                  <Text className="card-meta">
                    {project?.pattern.width} × {project?.pattern.height} ·{" "}
                    {record.syncState === "synced"
                      ? "已同步"
                      : record.syncState === "conflict"
                        ? "冲突副本"
                        : "已存本机"}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Empty
            title={query ? "没有找到设计" : "从第一张图纸开始"}
            detail={
              query ? "试试其他关键词" : "选一张图片，把喜欢的画面变成拼豆。"
            }
            action={
              <Button onClick={() => go("/creation/entry/index")}>
                开始创作
              </Button>
            }
          />
        )}
      </View>
      {selected && (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <View className="stack">
            <Button
              onClick={() => go(`/creation/editor/index?id=${selected.id}`)}
            >
              继续编辑
            </Button>
            <Button
              secondary
              onClick={() =>
                void perform(async () => {
                  const result = await promptText("重命名", selected.name);
                  if (result.confirm) {
                    const name = designNameSchema.parse(result.content);
                    const project = parseStoredProject(selected.projectJson)!;
                    await saveDesign(selected.id, {
                      ...project,
                      name,
                      updatedAt: new Date().toISOString(),
                    });
                    setSelected(null);
                    await refresh();
                  }
                })
              }
            >
              重命名
            </Button>
            <Button
              secondary
              onClick={() =>
                void perform(async () => {
                  const project = parseStoredProject(selected.projectJson)!;
                  const id = newId();
                  const src = await storage().getGenerationSource(selected.id);
                  await saveDesign(
                    id,
                    {
                      ...project,
                      name: project.name.slice(0, 95) + " 副本",
                      updatedAt: new Date().toISOString(),
                    },
                    storage(),
                    src ? { mode: "replace", source: src } : undefined,
                  );
                  setSelected(null);
                  await refresh();
                })
              }
            >
              复制设计
            </Button>
            <Button
              secondary
              onClick={() => go(`/export/output/index?id=${selected.id}`)}
            >
              导出
            </Button>
            <Button
              secondary
              onClick={() =>
                void perform(async () => {
                  if (
                    !(await confirm(
                      "删除设计",
                      s?.emailVerified
                        ? "删除将同步到云端。此操作不可撤销，请先导出备份。"
                        : "此操作不可撤销，请先导出备份。",
                    ))
                  )
                    return;
                  if (s?.emailVerified)
                    await syncClient().client.deleteLocal(selected.id);
                  else await storage().delete(selected.id);
                  setSelected(null);
                  await refresh();
                })
              }
            >
              删除设计
            </Button>
          </View>
        </Sheet>
      )}
    </Shell>
  );
}
