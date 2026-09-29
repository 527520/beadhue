import {
  Canvas,
  Image,
  ScrollView,
  Text,
  View,
  type CanvasProps,
} from "@tarojs/components";
import Taro, { useDidHide, useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { Shell } from "../../components/shell";
import {
  Button,
  Chip,
  IconButton,
  Notice,
  Sheet,
  Skeleton,
  confirm,
  go,
  perform,
  report,
  promptText,
} from "../../components/ui";
import { drawPattern } from "@beadhue/core/beads";
import { paletteColorsForSelection } from "@beadhue/core/kit";
import {
  createEditorState,
  paintBrush,
  eraseAt,
  fillAt,
  replaceCode,
  refreshStats,
  type EditorState,
} from "@beadhue/core/editor";
import { applyTransform, type TransformOp } from "@beadhue/core/operations";
import { EditHistory } from "@beadhue/core/history";
import {
  createStitchProgress,
  toggleCell,
  setBoardRowDone,
  findNextStitchTarget,
  isProgressCompatible,
  isStitchableCell,
  summarizeProgress,
  clearProgress,
  type StitchProgress,
} from "@beadhue/core/stitch";
import { getBoardProfile } from "@beadhue/core/boards";
import type { ProjectFile, PaletteColor } from "@beadhue/core/types";
import type { StorageAdapter } from "@beadhue/core/storage";
import { transformOriginal } from "@/lib/originals/geometry";
import { loadDesign, namespace, saveDesign } from "../../platform/designs";
import { canvasNode } from "../../platform/images";
import { CanvasGesture, type Point } from "../../platform/gesture";
import { privateImage } from "../../platform/network";

type CanvasEvent = Parameters<NonNullable<CanvasProps["onTouchStart"]>>[0];
type Tool = "hand" | "brush" | "eraser" | "pick" | "fill";
const tools: Array<[Tool, string, string]> = [
  ["hand", "Hand", "移动"],
  ["brush", "Pencil", "画笔"],
  ["eraser", "Eraser", "橡皮"],
  ["pick", "Pipette", "吸管"],
  ["fill", "PaintBucket", "填充"],
];
export default function Editor() {
  const id = useRouter().params.id ?? "";
  const [project, setProject] = useState<ProjectFile | null>(null);
  const state = useRef<EditorState | null>(null);
  const store = useRef<StorageAdapter | null>(null);
  const history = useRef(new EditHistory());
  const gesture = useRef(new CanvasGesture());
  const node = useRef<WechatMiniprogram.Canvas | null>(null);
  const latest = useRef<ProjectFile | null>(null);
  const progressRef = useRef<StitchProgress | null>(null);
  const scope = useRef(namespace());
  const [tick, render] = useState(0);
  const [tool, setTool] = useState<Tool>("hand");
  const [color, setColor] = useState<PaletteColor>({
    hex: "#000000",
    code: "A1",
  });
  const [size, setSize] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<"edit" | "stitch">("edit");
  const [panel, setPanel] = useState<"colors" | "more" | null>(null);
  const [saveState, setSaveState] = useState("已保存到本机");
  const [reference, setReference] = useState<string | null>(null);
  const [row, setRow] = useState(0);
  const [boardRow, setBoardRow] = useState(0);
  const [boardCol, setBoardCol] = useState(0);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<Point | null>(null);
  const info = Taro.getWindowInfo();
  const canvasHeight = Math.max(
    220,
    info.windowHeight - (info.statusBarHeight ?? 0) - 56 - 180,
  );
  const width = info.windowWidth;
  const height = canvasHeight;
  gesture.current.center = { x: width / 2, y: height / 2 };
  const projectRef = useRef(project);
  projectRef.current = project;
  const redraw = () => render((n) => n + 1);
  useEffect(() => {
    let alive = true;
    void perform(async () => {
      const loaded = await loadDesign(id);
      if (!alive) return;
      store.current = loaded.store;
      latest.current = loaded.project;
      state.current = createEditorState(loaded.project.pattern);
      const colors = paletteColorsForSelection(loaded.project.paletteSelection);
      setColor(colors[0]);
      const progress = await loaded.store.getStitchProgress(id);
      progressRef.current =
        progress && isProgressCompatible(progress, loaded.project.pattern)
          ? progress
          : createStitchProgress(
              loaded.project.pattern.width,
              loaded.project.pattern.height,
            );
      setProject(loaded.project);
    });
    return () => {
      alive = false;
      gesture.current.cancel();
    };
  }, [id]);
  useEffect(() => {
    if (!project) return;
    let alive = true;
    void canvasNode("editor-canvas")
      .then((c) => {
        if (alive) {
          node.current = c;
          redraw();
        }
      })
      .catch(report);
    return () => {
      alive = false;
    };
  }, [!!project]);
  useDidHide(() => {
    gesture.current.cancel();
    setTarget(null);
  });
  function frame() {
    const p = state.current!;
    const base = Math.min((width - 32) / p.width, (height - 32) / p.height);
    const camera = gesture.current.camera;
    const cell = base * camera.scale;
    return {
      cell,
      x: (width - p.width * cell) / 2 + camera.x,
      y: (height - p.height * cell) / 2 + camera.y,
    };
  }
  useEffect(() => {
    const c = node.current,
      s = state.current;
    if (!c || !s || !project) return;
    const dpr = Math.min(info.pixelRatio, 2);
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#F7F7F8";
    ctx.fillRect(0, 0, width, height);
    const f = frame();
    drawPattern(ctx, s, {
      ...f,
      mode: mode === "stitch" ? "flat" : "bead",
      grid: true,
      codes: mode === "stitch",
      seams: true,
      board: getBoardProfile(project.boardProfile).boardCols,
    });
    if (mode === "stitch" && progressRef.current) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      progressRef.current.done.forEach((done, i) => {
        if (done)
          ctx.fillRect(
            f.x + (i % s.width) * f.cell,
            f.y + Math.floor(i / s.width) * f.cell,
            f.cell,
            f.cell,
          );
      });
      const bs = getBoardProfile(project.boardProfile).boardCols;
      ctx.strokeStyle = "#3160E6";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        f.x + boardCol * bs * f.cell,
        f.y + (boardRow * bs + row) * f.cell,
        Math.min(bs, s.width - boardCol * bs) * f.cell,
        f.cell,
      );
    }
    if (target) {
      const cell = toCell(target);
      if (cell) {
        ctx.strokeStyle = "#3160E6";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          f.x + cell.col * f.cell,
          f.y + cell.row * f.cell,
          f.cell,
          f.cell,
        );
      }
    }
  }, [project, tick, mode, target, row, boardRow, boardCol]);
  function toCell(point: Point) {
    const s = state.current;
    if (!s) return null;
    const f = frame();
    const col = Math.floor((point.x - f.x) / f.cell),
      row = Math.floor((point.y - f.y) / f.cell);
    return row >= 0 && col >= 0 && row < s.height && col < s.width
      ? { row, col }
      : null;
  }
  const points = (e: CanvasEvent): Point[] =>
    e.touches.map((t) => ({ x: t.x, y: t.y }));
  async function persist(next: ProjectFile) {
    latest.current = next;
    setProject(next);
    setSaveState("正在保存…");
    try {
      await saveDesign(id, next, store.current!);
      setSaveState("已保存到本机");
      setError("");
    } catch (e) {
      setSaveState("保存失败");
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }
  function commit() {
    const s = state.current,
      p = latest.current;
    if (!s || !p || namespace() !== scope.current) return;
    const next = {
      ...p,
      pattern: {
        width: s.width,
        height: s.height,
        cells: s.cells.map((c) => ({ ...c })),
      },
      updatedAt: new Date().toISOString(),
    };
    void persist(next);
    redraw();
  }
  async function progress(next: StitchProgress) {
    progressRef.current = next;
    redraw();
    try {
      await store.current!.putStitchProgress(id, next);
    } catch (e) {
      report(e);
    }
  }
  function finish(e: CanvasEvent) {
    const point = gesture.current.end(e.touches.length, mode === "stitch");
    setTarget(null);
    if (!point) return;
    const cell = toCell(point),
      s = state.current;
    if (!cell || !s) return;
    if (mode === "stitch") {
      if (isStitchableCell(s.cells[cell.row * s.width + cell.col]))
        void progress(toggleCell(progressRef.current!, cell.row, cell.col));
      return;
    }
    if (tool === "hand") return;
    if (tool === "pick") {
      const picked = s.cells[cell.row * s.width + cell.col];
      if (picked.hex) setColor({ hex: picked.hex, code: picked.code });
      setTool("brush");
      return;
    }
    if (tool === "brush")
      paintBrush(s, history.current, cell.row, cell.col, size, color);
    if (tool === "eraser")
      eraseAt(s, history.current, cell.row, cell.col, size);
    if (tool === "fill") fillAt(s, history.current, cell.row, cell.col, color);
    commit();
  }
  function travel(redo: boolean) {
    const s = state.current;
    if (!s) return;
    const entry = redo
      ? history.current.redo(s.cells)
      : history.current.undo(s.cells);
    if (!entry) return;
    if (entry.dims)
      Object.assign(s, redo ? entry.dims.after : entry.dims.before);
    if (entry.original && latest.current)
      latest.current = {
        ...latest.current,
        original: redo ? entry.original.after : entry.original.before,
      };
    refreshStats(s);
    if (!isProgressCompatible(progressRef.current!, s))
      void progress(createStitchProgress(s.width, s.height));
    commit();
  }
  function transform(op: TransformOp) {
    const s = state.current!,
      p = latest.current!;
    const result = applyTransform(s.cells, s.width, s.height, op);
    const before = { width: s.width, height: s.height };
    const original = p.original?.geometry
      ? {
          before: p.original,
          after: {
            ...p.original,
            geometry: transformOriginal(p.original.geometry, op),
          },
        }
      : undefined;
    history.current.push({
      label: "transform",
      snapshots: result.cells.map((after, index) => ({
        index,
        before: s.cells[index],
        after,
      })),
      dims: { before, after: { width: result.width, height: result.height } },
      original,
    });
    Object.assign(s, result);
    if (original) latest.current = { ...p, original: original.after };
    refreshStats(s);
    void progress(createStitchProgress(s.width, s.height));
    gesture.current.camera = { x: 0, y: 0, scale: 1 };
    commit();
  }
  async function showReference() {
    if (reference) {
      setReference(null);
      return;
    }
    const original = latest.current?.original;
    if (!original) throw new Error("此设计没有原图");
    const local = `${wx.env.USER_DATA_PATH}/beadhue-${scope.current}/original-${original.sha256}.bin`;
    try {
      wx.getFileSystemManager().accessSync(local);
      setReference(local);
    } catch {
      setReference(await privateImage(`/api/designs/${id}/original`));
    }
  }
  if (!project)
    return (
      <Shell title="编辑图纸" back>
        <Skeleton />
      </Shell>
    );
  const s = state.current!,
    bs = getBoardProfile(project.boardProfile).boardCols;
  const colors = paletteColorsForSelection(project.paletteSelection);
  const summary = progressRef.current
    ? summarizeProgress(progressRef.current, s.cells)
    : null;
  return (
    <Shell title={project.name} back>
      <View className="content" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <View className="mode-tabs">
          <View
            className={mode === "edit" ? "active" : ""}
            onClick={() => setMode("edit")}
          >
            编辑
          </View>
          <View
            className={mode === "stitch" ? "active" : ""}
            onClick={() => setMode("stitch")}
          >
            跟拼
          </View>
        </View>
      </View>
      <View className="editor-stage" style={{ height }}>
        <Canvas
          type="2d"
          id="editor-canvas"
          className="editor-canvas"
          disableScroll
          onTouchStart={(e) => gesture.current.begin(points(e))}
          onTouchMove={(e) => {
            const p = points(e);
            gesture.current.move(p, tool === "hand" || mode === "stitch");
            setTarget(
              p.length === 1 && tool !== "hand" && mode === "edit"
                ? p[0]
                : null,
            );
            redraw();
          }}
          onTouchEnd={finish}
          onTouchCancel={() => {
            gesture.current.cancel();
            setTarget(null);
          }}
        />
        {reference && (
          <Image
            src={reference}
            mode="aspectFit"
            style={{
              position: "absolute",
              right: 12,
              top: 12,
              width: 120,
              height: 120,
              background: "#fff",
            }}
            onClick={() => setReference(null)}
          />
        )}
      </View>
      {mode === "edit" ? (
        <>
          <View className="toolbar">
            {tools.map(([key, icon, label]) => (
              <IconButton
                key={key}
                name={icon}
                label={label}
                active={tool === key}
                onClick={() => setTool(key)}
              />
            ))}
            <IconButton
              name="Undo2"
              label="撤销"
              disabled={!history.current.canUndo}
              onClick={() => travel(false)}
            />
            <IconButton
              name="Redo2"
              label="重做"
              disabled={!history.current.canRedo}
              onClick={() => travel(true)}
            />
          </View>
          <View className="editor-footer between">
            <View className="row" onClick={() => setPanel("colors")}>
              <View className="swatch" style={{ backgroundColor: color.hex }} />
              <Text className="caption">
                {color.code} · {s.stats.length} 色
              </Text>
            </View>
            <Text className="caption">{saveState}</Text>
            <IconButton
              name="MoreHorizontal"
              label="更多操作"
              onClick={() => setPanel("more")}
            />
          </View>
        </>
      ) : (
        <View className="editor-footer stack">
          <View className="between">
            <Text>
              板 {boardRow + 1},{boardCol + 1} · 第 {row + 1} 行
            </Text>
            <Text className="caption">进度仅存本机</Text>
          </View>
          <View className="row">
            <Button secondary onClick={() => setRow(Math.max(0, row - 1))}>
              上一行
            </Button>
            <Button
              onClick={() =>
                void progress(
                  setBoardRowDone(
                    progressRef.current!,
                    s.cells,
                    boardRow,
                    boardCol,
                    row,
                    true,
                    new Date(),
                    bs,
                  ),
                )
              }
            >
              完成本行
            </Button>
            <Button
              secondary
              onClick={() =>
                setRow(Math.min(bs - 1, s.height - boardRow * bs - 1, row + 1))
              }
            >
              下一行
            </Button>
            <IconButton
              name="MoreHorizontal"
              label="跟拼设置"
              onClick={() => setPanel("more")}
            />
          </View>
        </View>
      )}
      {error && (
        <Notice>
          {error}
          <Button
            secondary
            onClick={() => latest.current && void persist(latest.current)}
          >
            重试保存
          </Button>
        </Notice>
      )}
      {panel === "colors" && (
        <Sheet title="选择颜色" onClose={() => setPanel(null)}>
          <View className="row">
            {([1, 2, 3] as const).map((n) => (
              <Chip key={n} active={size === n} onClick={() => setSize(n)}>
                {n} × {n}
              </Chip>
            ))}
          </View>
          <View className="color-list">
            {colors.map((c) => (
              <View
                className="color-item"
                key={c.code ?? c.hex}
                onClick={() => {
                  setColor(c);
                  setPanel(null);
                }}
              >
                <View
                  className={`swatch ${c.code === color.code ? "selected" : ""}`}
                  style={{ backgroundColor: c.hex }}
                />
                <Text className="caption">{c.code}</Text>
              </View>
            ))}
          </View>
          <Button
            secondary
            onClick={() =>
              void perform(async () => {
                const answer = await promptText(
                  "全图换色",
                  "",
                  "输入要替换的原色号",
                );
                if (answer.confirm && answer.content) {
                  replaceCode(s, history.current, answer.content.trim(), color);
                  commit();
                  setPanel(null);
                }
              })
            }
          >
            将指定色号替换为 {color.code}
          </Button>
        </Sheet>
      )}
      {panel === "more" && (
        <Sheet
          title={mode === "stitch" ? "跟拼设置" : "图纸操作"}
          onClose={() => setPanel(null)}
        >
          <View className="stack">
            <Text className="muted">
              {s.width} × {s.height} 格 · {s.totalBeadCount} 颗豆 ·{" "}
              {getBoardProfile(project.boardProfile).displayName}
            </Text>
            {mode === "edit" ? (
              <>
                <Button
                  secondary
                  onClick={() => {
                    transform("mirrorH");
                    setPanel(null);
                  }}
                >
                  左右镜像
                </Button>
                <Button
                  secondary
                  onClick={() => {
                    transform("mirrorV");
                    setPanel(null);
                  }}
                >
                  上下镜像
                </Button>
                <Button
                  secondary
                  onClick={() => {
                    transform("rotateCW");
                    setPanel(null);
                  }}
                >
                  顺时针旋转
                </Button>
                <Button
                  secondary
                  onClick={() => {
                    go(`/creation/entry/index?id=${id}`);
                    setPanel(null);
                  }}
                >
                  调整参数并生成新设计
                </Button>
                <Button
                  secondary
                  onClick={() =>
                    void perform(async () => {
                      await showReference();
                      setPanel(null);
                    })
                  }
                >
                  原图参照
                </Button>
              </>
            ) : (
              <>
                <View className="row">
                  <Button
                    secondary
                    onClick={() => {
                      setBoardCol(Math.max(0, boardCol - 1));
                      setRow(0);
                    }}
                  >
                    左板
                  </Button>
                  <Button
                    secondary
                    onClick={() => {
                      setBoardCol(
                        Math.min(Math.ceil(s.width / bs) - 1, boardCol + 1),
                      );
                      setRow(0);
                    }}
                  >
                    右板
                  </Button>
                  <Button
                    secondary
                    onClick={() => {
                      setBoardRow(Math.max(0, boardRow - 1));
                      setRow(0);
                    }}
                  >
                    上板
                  </Button>
                  <Button
                    secondary
                    onClick={() => {
                      setBoardRow(
                        Math.min(Math.ceil(s.height / bs) - 1, boardRow + 1),
                      );
                      setRow(0);
                    }}
                  >
                    下板
                  </Button>
                </View>
                <Button
                  onClick={() => {
                    const next = findNextStitchTarget(
                      progressRef.current!,
                      s.cells,
                      bs,
                    );
                    if (next) {
                      setBoardCol(next.boardCol);
                      setBoardRow(next.boardRow);
                      setRow(next.localRow);
                    } else
                      void Taro.showToast({
                        title: "全部完成！",
                        icon: "success",
                      });
                    setPanel(null);
                  }}
                >
                  定位未完成处
                </Button>
                <Button
                  secondary
                  onClick={() =>
                    void perform(async () => {
                      if (
                        await confirm(
                          "清空进度",
                          "仅清空本机跟拼标记，图纸不变。",
                        )
                      )
                        await progress(clearProgress(progressRef.current!));
                    })
                  }
                >
                  清空跟拼进度
                </Button>
                <Text className="caption">
                  {summary
                    ? `已拼 ${summary.doneCount} / ${summary.total} 颗 · ${summary.percent}%`
                    : ""}
                </Text>
              </>
            )}
            <Button
              onClick={() => {
                setPanel(null);
                go(`/export/output/index?id=${id}`);
              }}
            >
              导出图纸
            </Button>
            <Button
              secondary
              onClick={() => {
                gesture.current.camera = { x: 0, y: 0, scale: 1 };
                redraw();
                setPanel(null);
              }}
            >
              图纸居中
            </Button>
          </View>
        </Sheet>
      )}
    </Shell>
  );
}
