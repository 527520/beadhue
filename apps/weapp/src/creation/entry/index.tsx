import { bytesToHex } from "@noble/hashes/utils.js";
import {
  Canvas,
  Image,
  Picker,
  ScrollView,
  Switch,
  Text,
  View,
} from "@tarojs/components";
import Taro, { useDidHide, useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { Shell } from "../../components/shell";
import {
  Button,
  Chip,
  Field,
  Notice,
  Range,
  go,
  perform,
  report,
} from "../../components/ui";
import { PatternPreview } from "../../components/pattern";
import {
  DEFAULT_GENERATION_PARAMS,
  type GenerationParams,
  type PaletteSelection,
  type ProjectFile,
} from "@beadhue/core/types";
import { listBuiltinPalettes } from "@beadhue/core/palettes";
import { compatibleBoardProfilesForPalette } from "@beadhue/core/boards";
import { createLocalGenerationSource } from "@beadhue/core/storage";
import { importProjectFile } from "@beadhue/core/project";
import {
  blankProject,
  loadDesign,
  newId,
  saveDesign,
  storage,
  namespace,
} from "../../platform/designs";
import { cancelTask, runTask } from "../../platform/worker";
import {
  canvasNode,
  decodeImage,
  fullCrop,
  pickImage,
  readImage,
  retainOriginal,
  restoreGenerationSource,
  type Crop,
  type PickedImage,
} from "../../platform/images";
import type { EngineOutput, ImageDataLike } from "@/lib/engine/types";
import { examples } from "../../examples";

export default function Entry() {
  const route = useRouter();
  const epoch = useRef(0);
  const ownerSpace = useRef(namespace());
  const [original, setOriginal] = useState<ProjectFile["original"]>();
  const [name, setName] = useState("未命名设计");
  const [image, setImage] = useState<PickedImage | null>(null);
  const [crop, setCrop] = useState<Crop>(fullCrop);
  const [params, setParams] = useState<GenerationParams>({
    ...DEFAULT_GENERATION_PARAMS,
  });
  const [selection, setSelection] = useState<PaletteSelection>({
    palette: { kind: "builtin", brand: "MARD" },
    kitTier: 0,
  });
  const [board, setBoard] = useState<ProjectFile["boardProfile"]>("5mm-29");
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [source, setSource] = useState<ImageDataLike | null>(null);
  const [busy, setBusy] = useState(false);
  const [blank, setBlank] = useState(false);
  const [height, setHeight] = useState(29);
  const [custom, setCustom] = useState<
    Array<{ name: string; colors: Array<{ code: string; hex: string }> }>
  >([]);
  const palettes = listBuiltinPalettes();
  const boards = compatibleBoardProfilesForPalette(selection.palette);
  useDidHide(() => {
    ++epoch.current;
    cancelTask();
    setBusy(false);
  });
  useEffect(() => {
    void perform(async () => {
      setCustom(
        JSON.parse((await storage().getMeta("custom-palettes")) ?? "[]").filter(
          (p: { deleted?: boolean }) => !p.deleted,
        ),
      );
      const sample = examples.find((e) => e.id === route.params.example);
      if (sample) {
        setImage(await readImage(sample.image));
        setName(sample.name);
      }
      if (route.params.id) {
        const { project, store } = await loadDesign(route.params.id);
        setOriginal(project.original);
        setName(project.name);
        setParams(project.params);
        setSelection(project.paletteSelection);
        setBoard(project.boardProfile);
        const s = await store.getGenerationSource(route.params.id);
        if (s)
          setSource({
            width: s.width,
            height: s.height,
            data: new Uint8ClampedArray(s.rgba),
          });
        else if (project.original) {
          setSource(
            await restoreGenerationSource(
              route.params.id,
              project.original,
              await canvasNode("decode"),
              ownerSpace.current,
            ),
          );
        }
      }
    });
  }, []);
  useEffect(() => {
    ++epoch.current;
    setPreview(null);
    cancelTask();
    setBusy(false);
  }, [params, selection, board, crop, blank, height, image]);
  const change = (
    key: keyof GenerationParams,
    value: number | boolean | string,
  ) => setParams((p) => ({ ...p, [key]: value }));
  async function generate() {
    if (!name.trim()) throw new Error("请填写设计名称");
    const task = ++epoch.current;
    setBusy(true);
    try {
      const input = image
        ? await decodeImage(image, await canvasNode("decode"), crop)
        : source;
      if (task !== epoch.current) return;
      if (!blank && !input) throw new Error("请选择图片或空白画布");
      const project = blankProject(name.trim(), params.targetWidth, height);
      project.params = params;
      project.paletteSelection = selection;
      project.boardProfile = board;
      if (!blank && input) {
        const output = await runTask<EngineOutput>({
          kind: "generate",
          width: input.width,
          height: input.height,
          rgba: bytesToHex(
            new Uint8Array(
              input.data.buffer,
              input.data.byteOffset,
              input.data.byteLength,
            ),
          ),
          params,
          selection,
        });
        if (task !== epoch.current) return;
        project.pattern = output.pattern;
        setSource(input);
      }
      if (!blank && !image && original) project.original = { ...original };
      if (!blank && image)
        project.original = {
          sha256: image.sha256,
          width: image.width,
          height: image.height,
          geometry: [crop.width, 0, 0, crop.height, crop.x, crop.y],
        };
      setPreview(project);
    } finally {
      if (task === epoch.current) setBusy(false);
    }
  }
  async function edit() {
    if (!preview) return;
    if (namespace() !== ownerSpace.current)
      throw new Error("账号已切换，请重新打开创作页面");
    const id = newId();
    if (image) retainOriginal(image);
    await saveDesign(
      id,
      preview,
      storage(),
      !blank && source
        ? { mode: "replace", source: createLocalGenerationSource(source) }
        : undefined,
    );
    void Taro.redirectTo({ url: `/creation/editor/index?id=${id}` });
  }
  async function importFile() {
    const chosen = await Taro.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["json"],
    });
    if (chosen.tempFiles[0].size > 5 * 1024 * 1024)
      throw new Error("项目文件不能超过 5 MB");
    const parsed = importProjectFile(
      wx
        .getFileSystemManager()
        .readFileSync(chosen.tempFiles[0].path, "utf8") as string,
    );
    if (!parsed.ok) throw new Error(parsed.errors.join("；"));
    const id = newId();
    await saveDesign(id, parsed.project);
    go(`/creation/editor/index?id=${id}`);
  }
  return (
    <Shell title="新建图纸" back>
      <View className="content stack">
        <View className="row">
          <Button
            onClick={() =>
              void perform(async () => {
                setImage(await pickImage());
                setBlank(false);
                setCrop(fullCrop);
              })
            }
          >
            相册选图
          </Button>
          <Button
            secondary
            onClick={() => {
              setBlank(true);
              setImage(null);
            }}
          >
            空白画布
          </Button>
          <Button secondary onClick={() => void perform(importFile)}>
            导入项目
          </Button>
        </View>
        <ScrollView scrollX className="chips">
          {examples.map((e) => (
            <Chip
              key={e.id}
              onClick={() =>
                void perform(async () => {
                  setImage(await readImage(e.image));
                  setBlank(false);
                  setName(e.name);
                })
              }
            >
              {e.name}
            </Chip>
          ))}
          <Chip onClick={() => go("/pages/mine/index")}>最近设计</Chip>
        </ScrollView>
        {image && (
          <>
            <Image src={image.path} className="sample-image" mode="aspectFit" />
            <View className="panel">
              <Text className="title3">裁剪范围</Text>
              <Range
                label="左侧起点 %"
                min={0}
                max={90}
                value={Math.round(crop.x * 100)}
                onChange={(n) =>
                  setCrop((c) => ({
                    ...c,
                    x: n / 100,
                    width: Math.min(c.width, 1 - n / 100),
                  }))
                }
              />
              <Range
                label="顶部起点 %"
                min={0}
                max={90}
                value={Math.round(crop.y * 100)}
                onChange={(n) =>
                  setCrop((c) => ({
                    ...c,
                    y: n / 100,
                    height: Math.min(c.height, 1 - n / 100),
                  }))
                }
              />
              <Range
                label="裁剪宽度 %"
                min={10}
                max={Math.round((1 - crop.x) * 100)}
                value={Math.round(crop.width * 100)}
                onChange={(n) => setCrop((c) => ({ ...c, width: n / 100 }))}
              />
              <Range
                label="裁剪高度 %"
                min={10}
                max={Math.round((1 - crop.y) * 100)}
                value={Math.round(crop.height * 100)}
                onChange={(n) => setCrop((c) => ({ ...c, height: n / 100 }))}
              />
            </View>
          </>
        )}
        <Field label="设计名称" value={name} onChange={setName} />
        <Range
          label="宽度（格）"
          min={20}
          max={200}
          value={params.targetWidth}
          onChange={(n) => change("targetWidth", n)}
        />
        {blank && (
          <Range
            label="高度（格）"
            min={1}
            max={200}
            value={height}
            onChange={setHeight}
          />
        )}
        <Picker
          mode="selector"
          range={[
            ...palettes.map((p) => p.label),
            ...custom.map((p) => p.name),
          ]}
          onChange={(e) => {
            const i = Number(e.detail.value);
            const palette: PaletteSelection["palette"] =
              i < palettes.length
                ? { kind: "builtin", brand: palettes[i].id }
                : {
                    kind: "custom",
                    colors: custom[i - palettes.length].colors,
                  };
            setSelection({ palette, kitTier: 0 });
            setBoard(compatibleBoardProfilesForPalette(palette)[0].id);
          }}
        >
          <View className="action-row">
            <Text>色板</Text>
            <Text>
              {selection.palette.kind === "builtin"
                ? palettes.find(
                    (p) =>
                      p.id === (selection.palette as { brand: string }).brand,
                  )?.label
                : "自定义色板"}{" "}
              ›
            </Text>
          </View>
        </Picker>
        <Picker
          mode="selector"
          range={boards.map((b) => b.displayName)}
          onChange={(e) => setBoard(boards[Number(e.detail.value)].id)}
        >
          <View className="action-row">
            <Text>制作规格</Text>
            <Text>{boards.find((b) => b.id === board)?.displayName} ›</Text>
          </View>
        </Picker>
        {!blank && (
          <>
            <Range
              label="颜色数"
              min={2}
              max={128}
              value={params.targetColorCount}
              onChange={(n) => change("targetColorCount", n)}
            />
            <Range
              label="亮度"
              min={-100}
              max={100}
              value={params.brightness}
              onChange={(n) => change("brightness", n)}
            />
            <Range
              label="对比度"
              min={-100}
              max={100}
              value={params.contrast}
              onChange={(n) => change("contrast", n)}
            />
            <View className="between">
              <Text>去除背景</Text>
              <Switch
                checked={params.backgroundRemoval}
                onChange={(e) => change("backgroundRemoval", e.detail.value)}
                color="#3160E6"
              />
            </View>
            {params.backgroundRemoval && (
              <Range
                label="背景容差"
                min={0}
                max={40}
                value={params.bgTolerance}
                onChange={(n) => change("bgTolerance", n)}
              />
            )}
            <View className="between">
              <Text>抖动</Text>
              <Switch
                checked={params.dithering}
                onChange={(e) => change("dithering", e.detail.value)}
                color="#3160E6"
              />
            </View>
            <View className="row">
              <Chip
                active={params.mode === "dominant"}
                onClick={() => change("mode", "dominant")}
              >
                主色取样
              </Chip>
              <Chip
                active={params.mode === "average"}
                onClick={() => change("mode", "average")}
              >
                平均取样
              </Chip>
            </View>
          </>
        )}
        <Button loading={busy} onClick={() => void generate().catch(report)}>
          {blank ? "创建画布" : "生成预览"}
        </Button>
        {busy && (
          <Button
            secondary
            onClick={() => {
              ++epoch.current;
              cancelTask();
              setBusy(false);
            }}
          >
            取消生成
          </Button>
        )}
        {preview && (
          <>
            <PatternPreview pattern={preview.pattern} />
            <Text className="caption">
              {preview.pattern.width} × {preview.pattern.height} 格
            </Text>
            <Button onClick={() => void perform(edit)}>保存并开始编辑</Button>
          </>
        )}
        <Notice>本地创作无需登录。您可以随时在「我的」选择云同步。</Notice>
        <Canvas type="2d" id="decode" className="hidden-canvas" />
      </View>
    </Shell>
  );
}
