"use client";
import {
  cacheOriginal,
  getCachedOriginal,
  enqueueOriginalUpload,
} from "@/lib/originals/client";
import {
  cropMatrix,
  originalRegion,
  orientOriginalRegion,
  type OriginalReference,
} from "@/lib/originals/geometry";
import { sniffImageType } from "@/lib/image/sniff";

/**
 * 工作台（T12）：选图→整图首版→可选裁剪 + 生成管线 + 编辑器 + 导出 + 本地保存。
 * 本地保存：IndexedDB（未登录可用）；自动保存 1s 防抖 + Ctrl/⌘+S；beforeunload 防丢失；
 * 按 /app?id= 恢复设计；配额满/存储不可用降级提示（E39）。
 * 界面：创作入口（CreateEntry + 弹窗）与编辑器工作区（EditorWorkspace，桌面 / 手机同一组件）；这里只做业务。
 */
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { perfMark } from "@/lib/perf/mark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ValidImageFile } from "@/lib/image/validation";
import {
  canFetchRevisionOriginal,
  fetchRevisionOriginal,
} from "@/lib/community/originalsClient";
import {
  lookupOriginalSource,
  takePendingOriginal,
  type PendingOriginal,
} from "@/lib/storage/pendingOriginals";
import {
  createStitchProgress,
  isProgressCompatible,
  type StitchProgress,
} from "@/lib/progress/stitchProgress";
import { useAuthStatus } from "@/components/account/useAuthStatus";
import { FALLBACK_DEFAULT_PALETTE, useDefaultPalette } from "@/components/account/useDefaultPalette";
import { SiteShell } from "@/components/shell/site-shell";
import { RefreshCw } from "lucide-react";
import {
  EditorWorkspace,
  type WorkspaceNotice,
} from "@/components/editor-workspace/editor-workspace";
import { RecropDialog } from "@/components/editor-workspace/recrop-dialog";
import { useConfirmDialog } from "@/components/editor-workspace/use-confirm-dialog";
import type {
  MissingReason,
  ReferenceStatus,
} from "@/components/editor-workspace/reference";
import { useToast } from "@/components/ui/toast";
import { CreateEntry } from "@/components/create/create-entry";
import {
  NewDrawingDialog,
  type NewDrawingSettings,
} from "@/components/create/new-drawing-dialog";
import {
  BlankCanvasDialog,
  type BlankCanvasSettings,
} from "@/components/create/blank-canvas-dialog";
import {
  buildPaletteChoices,
  findPaletteChoice,
  paletteSizes,
  specChoices as buildSpecChoices,
  type PaletteChoice,
} from "@/components/create/palette-choices";
import type { CloudSaveState, SaveState } from "@/components/editor-workspace/editor-model";
import { zhCN } from "@/messages/zh-CN";
import {
  DEFAULT_GENERATION_PARAMS,
  type GenerationParams,
  type PaletteColor,
  type PaletteSelection,
  type Pattern,
  type ProjectFile,
  type ProjectPalette,
} from "@/lib/types";
import {
  getBuiltinPalette,
  isBuiltinPaletteId,
  listBuiltinPalettes,
  type BuiltinPaletteId,
} from "@/lib/palettes";
import { cropImageData, type Rect } from "@/lib/crop/layout";
import {
  computeStats,
  totalBeadCount,
  MAX_GENERATION_SOURCE_DIMENSION,
} from "@/lib/engine/generate";
import { remapPattern } from "@/lib/engine/remap";
import {
  createBlankPattern,
  paletteColorsForSelection,
} from "@/lib/engine/kit";
import {
  KIT_TIERS,
  isKitTierAvailableForPalette,
  projectPaletteEngineColors,
} from "@/lib/kitTiers";
import {
  DEFAULT_BOARD_PROFILE_ID,
  compatibleBoardProfilesForPalette,
  defaultBoardProfileForPalette,
  getBoardProfile,
  isBoardProfileId,
} from "@/lib/boardProfiles";

import {
  disposeGenerateWorker,
  prepareGenerationSource,
  runGenerate,
} from "@/lib/engine/runGenerate";
import {
  selectCommittedSnapshot,
  type GenerationCommit,
  type GenerationDraft,
} from "@/lib/engine/session";
import { useGenerationSession } from "@/lib/engine/useGenerationSession";
import type { EngineOutput, ImageDataLike } from "@/lib/engine/types";
import {
  createImageDecoder,
  decodeImageFile,
  decodeImageRegion,
  type DecodeResult,
  type DecodedImage,
  type ImageDecoder,
} from "@/lib/image/decode";
import { validateImageFile, validatePixelCount } from "@/lib/image/validation";
import type { ImageType } from "@/lib/image/sniff";
import {
  createLocalGenerationSource,
  createDesignRecord,
  imageDataFromLocalGenerationSource,
  isQuotaError,
  newDesignId,
  openIndexedDb,
  parseStoredProject,
  replaceGenerationSource,
  CLEAR_GENERATION_SOURCE,
  renderThumbnail,
  type LocalGenerationSourceV1,
  type StorageAdapter,
} from "@/lib/storage";
import { conflictName, importProjectFile } from "@/lib/project/parse";
import { projectFileName, serializeProject } from "@/lib/project/serialize";
import {
  ENGINE_VERSION,
  LIMITS,
  PROJECT_FILE_FORMAT,
  PROJECT_FILE_VERSION,
} from "@/lib/appInfo";
import { usePublicConfig } from "@/components/config/usePublicConfig";
import { createBeadhueApi } from "@/lib/sync/api";
import { enqueueDesignSync, withDesignStorageLock } from "@/lib/sync/queue";
import { createSyncClient, type SyncOutcome } from "@/lib/sync/clientAdapter";
import { getPaletteColors, listPalettes } from "@/components/palettes/api";
import { track } from "@/lib/analytics/client";
import { colorBucket, widthBucket } from "@/lib/analytics/buckets";

type Step = "upload" | "crop" | "workspace";
type Tab = "edit" | "stitch";
type PaletteKind =
  { kind: "builtin"; brand: BuiltinPaletteId } | { kind: "custom" };

interface PendingStitchWrite {
  adapter: StorageAdapter;
  designId: string;
  progress: StitchProgress;
}

function paletteColorsMatch(
  projectPalette: ProjectPalette,
  colors: readonly PaletteColor[],
): boolean {
  if (
    projectPalette.kind !== "custom" ||
    projectPalette.colors.length !== colors.length
  )
    return false;
  return projectPalette.colors.every((color, index) => {
    const candidate = colors[index];
    return (
      candidate.code !== null &&
      color.code.trim().toUpperCase() === candidate.code.trim().toUpperCase() &&
      color.hex.toUpperCase() === candidate.hex.toUpperCase()
    );
  });
}

/** 清除 URL 上的 ?id= 参数：回到创作入口（/app 无 id 不恢复任何设计）。 */
function clearDesignQuery(): void {
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", "/app");
  }
}

/** 新设计进入编辑器后把 id 写进地址（/app?id=），刷新即恢复这一份。 */
function showDesignQuery(id: string): void {
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", `/app?id=${encodeURIComponent(id)}`);
  }
}

/** 原型 ?drag=1：创作入口强制显示拖入态（视觉对照用）。 */
const subscribeNothing = () => () => {};
function useForcedDragging(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => new URLSearchParams(window.location.search).get("drag") === "1",
    () => false,
  );
}

interface WorkbenchProps {
  /** 测试/环境注入：本地存储适配器；null 表示不可用；缺省自行打开 IndexedDB。 */
  storage?: StorageAdapter | null;
  /** 测试注入：解码函数（默认 decodeImageFile）。 */
  decodeFn?: (bytes: Uint8Array, type: ImageType) => Promise<DecodeResult>;
  /** 测试注入：按自然像素选区解码到有界生成缓冲。 */
  decodeRegionFn?: typeof decodeImageRegion;
  /** 测试/运行时接缝：持久图片 Worker；注入实例的生命周期由调用方拥有。 */
  imageDecoder?: ImageDecoder;
  /** T17 接缝：保存状态变化回调。 */
  onSavedStatus?: (status: SaveState) => void;
  /** 测试/运行时接缝：可替换 Worker adapter，验证失败与取消状态。 */
  generateFn?: typeof runGenerate;
}

export default function Workbench({
  storage,
  decodeFn,
  decodeRegionFn,
  imageDecoder,
  onSavedStatus,
  generateFn,
}: WorkbenchProps) {
  const t = zhCN.workbench;
  const router = useRouter();
  // 破坏性操作统一走确认弹窗（C-7）：入口与编辑器共用。
  const { confirm, confirmDialog } = useConfirmDialog();
  const toast = useToast();
  /** 换色板 / 规格 / 档位的结果提示：带「撤销」的提示条。 */
  const undoRegenerationRef = useRef<() => void>(() => undefined);
  const notifyUndoable = useCallback(
    (message: string): void => {
      toast(message, {
        action: {
          label: zhCN.editorWorkspace.undoAction,
          onClick: () => undoRegenerationRef.current(),
        },
      });
    },
    [toast],
  );
  const [ownedImageDecoder] = useState<ImageDecoder>(() =>
    createImageDecoder(),
  );
  const activeImageDecoder = imageDecoder ?? ownedImageDecoder;
  // 站点公开配置（票 02）：生成默认参数可被服务端环境变量覆盖，改配置即生效；新建图纸默认去背景（原型）
  const pubCfg = usePublicConfig();
  const defaultParams = useMemo<GenerationParams>(
    () => ({
      ...DEFAULT_GENERATION_PARAMS,
      targetWidth: pubCfg.generation.defaultWidth,
      targetColorCount: pubCfg.generation.defaultColorCount,
      backgroundRemoval: true,
    }),
    [pubCfg],
  );

  const [step, setStep] = useState<Step>("upload");
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [lastCropRect, setLastCropRect] = useState<Rect | undefined>();
  const encodedSourceRef = useRef<{
    bytes: Uint8Array;
    type: ImageType;
  } | null>(null);
  /**
   * 当前会话原图的编码字节副本（D49）。解码器会接管并转移原字节，这里保留一份
   * 完整原图单独缓存和上传，图纸 JSON 仅保存资产引用与几何关系。
   */
  const [original, setOriginal] = useState<OriginalReference | undefined>();
  const originalRef = useRef<OriginalReference | undefined>(undefined);
  const candidateOriginalRef = useRef<OriginalReference | undefined>(undefined);
  const originalByPatternRef = useRef(
    new WeakMap<Pattern, OriginalReference | undefined>(),
  );
  const originalBySourceRef = useRef(
    new WeakMap<ImageDataLike, OriginalReference>(),
  );
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(
    null,
  );
  /** 原图载入结果（按 sha256 记，换原图后旧结果自然失效）：决定原图参照是「可用 / 载入中 / 缺失」。 */
  const [originalImageState, setOriginalImageState] = useState<{
    sha256: string;
    state: "ready" | "missing";
  } | null>(null);
  const updateOriginal = useCallback((next: OriginalReference | undefined) => {
    originalRef.current = next;
    setOriginal(next);
  }, []);
  const retainedOriginalRef = useRef<{
    bytes: Uint8Array;
    type: ImageType;
    name: string;
  } | null>(null);
  /** 豆社引用来源：可从服务器取回原图时，restored-locked 提示多一个「从豆社取回原图」入口。 */
  const [communitySourceProbe, setCommunitySource] = useState<{
    revisionId: string;
    designId: string;
  } | null>(null);
  const imageOperationRef = useRef(0);
  const imageBusyRef = useRef(false);
  /** Restored projects rebind an original image without becoming a new design. */
  const rebindRestoredSourceRef = useRef(false);
  /** undefined 保留、null 清除，其余与图纸原子写入；仅成功生成可进入此处。 */
  const pendingGenerationSourceRef = useRef<ImageDataLike | null | undefined>(
    undefined,
  );
  const pendingCropRef = useRef<{ source: ImageDataLike; rect: Rect } | null>(
    null,
  );
  const cropRectsRef = useRef(new WeakMap<ImageDataLike, Rect>());
  /** 「新建图纸」弹窗里点了生成、首版图纸尚未提交：弹窗保持打开，成功后才进入编辑器。 */
  const firstDrawingRef = useRef(false);
  /** 当前选中的云端自定义色板 id（null = 导入项目自带的色板或内置品牌）。 */
  const [customPaletteId, setCustomPaletteId] = useState<string | null>(null);
  /**
   * ProjectPalette 只保存颜色，不保存云端自定义色板 id。换色板的一步撤销因此需要
   * 会话级身份元数据；snapshot 引用用于确保旧元数据不会误配给后续生成/重映射。
   */
  const paletteIdentityUndoRef = useRef<{
    snapshot: GenerationCommit;
    customPaletteId: string | null;
  } | null>(null);
  /** 云端自定义色板列表（优化票 06：登录后从 /api/palettes 加载，工作台可选）。 */
  const [cloudPalettes, setCloudPalettes] = useState<
    Array<{ id: string; name: string; colors: PaletteColor[] }>
  >([]);
  /** 云端自定义色板加载失败（D-4）：内置色板仍可用，因此只是提示而非阻断。 */
  const [paletteLoadFailed, setPaletteLoadFailed] = useState(false);
  const initialGenerationDraft = useMemo<GenerationDraft>(() => {
    return {
      boardProfile: DEFAULT_BOARD_PROFILE_ID,
      params: defaultParams,
      paletteSelection: {
        palette: { kind: "builtin", brand: "MARD" },
        kitTier: 0,
      },
    };
  }, [defaultParams]);
  const [designId, setDesignId] = useState<string>(() => newDesignId());
  const designIdRef = useRef(designId);
  const setActiveDesignId = useCallback((id: string): void => {
    designIdRef.current = id;
    setDesignId(id);
  }, []);
  const [name, setName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [communityOrigin, setCommunityOrigin] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState<string>(zhCN.workbench.decoding);
  const replacementBackupRef = useRef<{
    decoded: DecodedImage | null;
    rect: Rect | undefined;
    retained: typeof retainedOriginalRef.current;
    encoded: typeof encodedSourceRef.current;
    candidate: OriginalReference | undefined;
  } | null>(null);
  const restoreReplacement = useCallback((): void => {
    const backup = replacementBackupRef.current;
    if (!backup) return;
    replacementBackupRef.current = null;
    retainedOriginalRef.current = backup.retained;
    encodedSourceRef.current = backup.encoded;
    candidateOriginalRef.current = backup.candidate;
    setDecoded(backup.decoded);
    setLastCropRect(backup.rect);
    // The worker decoder may now hold the rejected image. Reload the retained
    // original before allowing another crop; the committed pattern stays intact.
    if (backup.retained && !decodeFn && !decodeRegionFn) {
      imageBusyRef.current = true;
      setBusy(true);
      const operation = ++imageOperationRef.current;
      void activeImageDecoder
        .load(backup.retained.bytes.slice(), backup.retained.type)
        .then((result) => {
          if (operation === imageOperationRef.current && !result.ok)
            setDecoded(null);
        })
        .catch(() => {
          if (operation === imageOperationRef.current) setDecoded(null);
        })
        .finally(() => {
          if (operation === imageOperationRef.current) {
            imageBusyRef.current = false;
            setBusy(false);
          }
        });
    }
  }, [activeImageDecoder, decodeFn, decodeRegionFn]);
  const clearOriginalSource = useCallback((): void => {
    replacementBackupRef.current = null;
    imageOperationRef.current += 1;
    imageBusyRef.current = false;
    setBusy(false);
    setDecoded(null);
    setLastCropRect(undefined);
    encodedSourceRef.current = null;
    retainedOriginalRef.current = null;
    updateOriginal(undefined);
    candidateOriginalRef.current = undefined;
    pendingCropRef.current = null;
    activeImageDecoder.clear();
  }, [activeImageDecoder, updateOriginal]);
  const {
    state: generationSession,
    generate: startGeneration,
    cancel: cancelGeneration,
    abort: abortGeneration,
    commitCancel,
    upload: uploadGenerationSource,
    reupload: reuploadGenerationSource,
    replaceSource: replaceGenerationSourceForCrop,
    updateDraft: updateGenerationDraft,
    restore: restoreGeneration,
    commitManualEdit,
    remapPalette,
    undoRegeneration,
  } = useGenerationSession<EngineOutput>(initialGenerationDraft);
  const source = generationSession.source;
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = generationSession.committedSource;
  }, [generationSession.committedSource]);
  const generating = generationSession.status === "generating";
  /**
   * 生成轮次：每次 onStart +1，作为取消控件的 key。
   * 「本次生成是否已点过取消」这个状态由 GenerationCancelControl 自己持有；
   * 换 key 重挂即复位，既不用在 effect 里同步跟随 generating（会触发
   * react-hooks/set-state-in-effect），也不用把状态留在 Workbench 里——
   * 留在 Workbench 会让点击取消 flushSync 整个组件（CI 实测 188ms，门禁 100ms）。
   */
  const [generationRound, setGenerationRound] = useState(0);
  // Pattern/statistics are projections of the session's immutable commit;
  // Workbench never mirrors a second independently mutable copy.
  const pattern = generationSession.committed?.pattern ?? null;
  const patternWidth = pattern?.width ?? null;
  const patternHeight = pattern?.height ?? null;
  const stats = generationSession.committed?.stats ?? [];
  const total = generationSession.committed?.total ?? 0;
  /**
   * 生成完成计数：每次成功 +1，触发一次礼貌播报。
   * 0 表示本会话还没生成过（不放动效）。
   */
  const [doneToken, setDoneToken] = useState(0);
  const generationDraft = generationSession.draft ?? initialGenerationDraft;
  const paletteSelection = generationDraft.paletteSelection;
  const kitTier = paletteSelection.kitTier;
  const params = generationDraft.params;
  const projectPalette = paletteSelection.palette;
  const palette = useMemo(
    () => paletteColorsForSelection(paletteSelection),
    [paletteSelection],
  );
  const boardProfile = generationDraft.boardProfile;
  const boardSpec = getBoardProfile(boardProfile);
  const paletteKind: PaletteKind = useMemo(
    () =>
      projectPalette.kind === "builtin"
        ? { kind: "builtin", brand: projectPalette.brand }
        : { kind: "custom" },
    [projectPalette],
  );
  /** 快速任务 <300ms 不显示进度槽；实际进度由 generationSession 独占。 */
  const [showProgress, setShowProgress] = useState(false);
  const progress = showProgress ? generationSession.progress : null;
  /** 生成开始时刻：进度条仅当任务超过 300ms 才显示（快速任务直接出结果）。 */
  const genStartedAtRef = useRef(0);
  const cancelEpochRef = useRef(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const visibleErrorMsg = errorMsg ?? generationSession.error;
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  /**
   * 登录态（J-1）：决定头部显示「登录/注册」还是账号邮箱。
   * 探测逻辑收在 useAuthStatus，与首页导航、新手引导共用同一套 401/网络失败处理。
   * 这里把 loading 视为 guest —— 工作台不需要等登录态就能用。
   */
  const auth = useAuthStatus();
  const authStatus = useMemo(
    () =>
      auth.kind === "user"
        ? { kind: "user" as const, email: auth.email }
        : { kind: "guest" as const, email: "" },
    [auth],
  );

  // 优化票 06：登录后加载云端自定义色板进「色板品牌」下拉；失败静默（内置色板照常可用）
  useEffect(() => {
    if (authStatus.kind !== "user") {
      return;
    }
    let cancelled = false;
    listPalettes()
      .then((list) => {
        if (cancelled) return;
        setCloudPalettes(
          list
            .map((record) => ({ ...record, colors: getPaletteColors(record) }))
            .filter((record) => record.colors.length > 0)
            .map((p) => ({
              id: p.id,
              name: p.name,
              colors: p.colors,
            })),
        );
      })
      .catch(() => {
        // D-4：以前这里是空 catch，云端色板加载失败时用户完全不知道——
        // 下拉里只是「少了」自己的色板，会以为色板丢了。文案早已写好但从未渲染。
        if (!cancelled) setPaletteLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus.kind]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [cloudSaveState, setCloudSaveState] =
    useState<CloudSaveState>("pending");
  const [storageReady, setStorageReady] = useState(false);
  const [tab, setTab] = useState<Tab>("edit");
  const [blankOpen, setBlankOpen] = useState(false);
  /** D72 深链：/app?id=…&publish=1 打开后直接弹出「公开到豆社」；带 workId 时是已有作品的修改后重投。 */
  const [publishRequested, setPublishRequested] = useState(false);
  const [publishWorkId, setPublishWorkId] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [paletteIntent, setPaletteIntent] = useState<{
    designId: string;
    value: string;
  } | null>(null);
  /**
   * 跟拼进度（G-1）：按设计 id 存在本机 IndexedDB，与图纸尺寸绑定。
   * null 表示本地存储不可用（隐私模式）；尺寸不匹配时重建，避免把「已拼」错位。
   */
  const [stitchProgress, setStitchProgress] = useState<StitchProgress | null>(
    null,
  );
  const [stitchSaveError, setStitchSaveError] = useState(false);
  /**
   * 跟拼写入只允许一个在途请求；pending 始终被最新快照覆盖。
   * 这样快速点按不会让较慢的旧写入在最后反向覆盖新状态。
   */
  const pendingStitchWriteRef = useRef<PendingStitchWrite | null>(null);
  const activeStitchWriteRef = useRef<Promise<void> | null>(null);
  const stitchWriteFailedRef = useRef(false);
  const adapterRef = useRef<StorageAdapter | null>(null);
  const dirtyRef = useRef(false);
  /** 编辑代数：每次置脏 +1；保存完成后仅当代数未变才清脏（避免抹掉保存期间的编辑）。 */
  const editGenRef = useRef(0);
  /**
   * 自动保存防抖句柄（A-15）：以前靠 effect 依赖 [pattern, name, generationDraft] 间接触发，
   * 而判断条件读的是非响应式的 dirtyRef —— 任何「只置脏、不改这三者」的新代码路径都会
   * 静默丢失自动保存。现在由 markDirty 直接排程，置脏与排程是同一个动作。
   */
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSaveRef = useRef<(() => Promise<boolean>) | null>(null);

  const scheduleAutosave = useCallback((): void => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      if (!dirtyRef.current) return;
      void doSaveRef.current?.();
    }, 1000);
  }, []);

  const markDirty = useCallback((): void => {
    dirtyRef.current = true;
    editGenRef.current += 1;
    setSaveState("dirty");
    setCloudSaveState("pending");
    scheduleAutosave();
  }, [scheduleAutosave]);

  // 地址里 ?palette= 的换色板意图只认内置色板与云端自定义色板。
  const paletteOptions = useMemo(() => [
    ...listBuiltinPalettes().map((summary) => ({ value: `builtin:${summary.id}`, brand: summary.brand, series: summary.series })),
    ...cloudPalettes.map((p) => ({ value: `custom:${p.id}`, brand: zhCN.params.customPaletteGroup, series: p.name })),
  ], [cloudPalettes]);

  const selectedPalette =
    paletteKind.kind === "custom"
      ? customPaletteId
        ? `custom:${customPaletteId}`
        : "__custom"
      : `builtin:${paletteKind.brand}`;

  const fullPalette = useMemo<PaletteColor[]>(
    () => projectPaletteEngineColors(projectPalette),
    [projectPalette],
  );
  const paletteColorCount = fullPalette.length;
  const paletteDisplayName =
    projectPalette.kind === "builtin"
      ? getBuiltinPalette(projectPalette.brand).label
      : zhCN.workbench.customPaletteLabel;

  const resolveCustomPaletteId = useCallback(
    (
      draftPalette: ProjectPalette,
      preferredId: string | null,
    ): string | null => {
      if (draftPalette.kind !== "custom") return null;
      const preferred = preferredId
        ? cloudPalettes.find((entry) => entry.id === preferredId)
        : undefined;
      if (preferred && paletteColorsMatch(draftPalette, preferred.colors))
        return preferred.id;
      return (
        cloudPalettes.find((entry) =>
          paletteColorsMatch(draftPalette, entry.colors),
        )?.id ?? null
      );
    },
    [cloudPalettes],
  );

  const restoreDraftControls = useCallback(
    (draft: GenerationDraft): void => {
      // Force a fresh controlled value even when React batches the rejected
      // draft and rollback into one render; otherwise the panel's local draft
      // can remain visible while the parent state bails out by object identity.
      updateGenerationDraft({
        boardProfile: draft.boardProfile,
        params: { ...draft.params },
        paletteSelection: draft.paletteSelection,
      });
      setCustomPaletteId((current) =>
        resolveCustomPaletteId(draft.paletteSelection.palette, current),
      );
    },
    [resolveCustomPaletteId, updateGenerationDraft],
  );

  /** 用当前参数在给定源图上重新生成；失败给出可重试提示。
   * 优化票 07：Worker 后台执行（页面不冻结），进度按阶段上报（>300ms 才显示），
   * 可取消（终止 Worker）；token 防旧结果覆盖新结果（取消语义）。 */
  const regenerate = useCallback((): void => {
    startGeneration({
      create: (src, draft, onProgress) =>
        (generateFn ?? runGenerate)(
          {
            src,
            params: draft.params,
            palette: paletteColorsForSelection(draft.paletteSelection),
          },
          onProgress,
        ),
      commit: (output, draft) => ({
        ...draft,
        pattern: output.pattern,
        stats: output.stats,
        total: output.totalBeadCount,
        engineVersion: ENGINE_VERSION,
      }),
      errorMessage: t.generateFailed,
      onStart: () => {
        if (generationSession.committed)
          originalByPatternRef.current.set(
            generationSession.committed.pattern,
            originalRef.current,
          );
        cancelEpochRef.current += 1;
        genStartedAtRef.current = performance.now();
        perfMark("workbench-generation-start");
        setShowProgress(false);
        setErrorMsg(null);
        // 新一轮生成开始：换 key 让取消控件重挂，「已点取消」随之复位、按钮重新出现。
        setGenerationRound((round) => round + 1);
        track({
          name: "generation_started",
          properties: {
            widthBucket: widthBucket(generationDraft.params.targetWidth),
            colorBucket: colorBucket(palette.length),
            boardProfile: generationDraft.boardProfile,
            dithering: generationDraft.params.dithering,
          },
        });
      },
      onProgress: () => {
        if (performance.now() - genStartedAtRef.current >= 300)
          setShowProgress(true);
      },
      onSuccess: () => {
        replacementBackupRef.current = null;
        const appliedCrop = pendingCropRef.current;
        if (appliedCrop) {
          pendingGenerationSourceRef.current = appliedCrop.source;
          cropRectsRef.current.set(appliedCrop.source, appliedCrop.rect);
          setLastCropRect(appliedCrop.rect);
          const full = candidateOriginalRef.current ?? originalRef.current;
          if (full?.width && full.height) {
            const aligned = {
              ...full,
              geometry: cropMatrix(appliedCrop.rect, full.width, full.height),
            };
            originalBySourceRef.current.set(appliedCrop.source, aligned);
            updateOriginal(aligned);
          }
          pendingCropRef.current = null;
        } else if (source) {
          const aligned = originalBySourceRef.current.get(source);
          if (aligned)
            updateOriginal({
              ...aligned,
              assetId:
                originalRef.current?.sha256 === aligned.sha256
                  ? originalRef.current.assetId
                  : aligned.assetId,
            });
        }
        track({
          name: "generation_succeeded",
          properties: {
            widthBucket: widthBucket(generationDraft.params.targetWidth),
            colorBucket: colorBucket(palette.length),
          },
        });
        markDirty();
        if (firstDrawingRef.current) {
          firstDrawingRef.current = false;
          // 新图纸默认以所选图片命名（原型：照片名 / 示例名），用户随时可在顶栏改名。
          const fileName = retainedOriginalRef.current?.name
            .replace(/\.[^.]+$/, "")
            .trim()
            .slice(0, LIMITS.designNameLength);
          if (fileName)
            setName((current) => (current.trim() ? current : fileName));
          setStep("workspace");
          showDesignQuery(designIdRef.current);
        } else {
          // 提示放到下一个任务：提示栈是同步外部状态，和换图纸的重渲染挤在一帧里会成长任务。
          window.setTimeout(() =>
            toast(zhCN.editorWorkspace.regenerated, {
              icon: <RefreshCw aria-hidden="true" strokeWidth={1.75} />,
            }),
          );
        }
        // D-1：生成完成的可感知反馈（播报 + 三段编排 + 数字滚动）
        setDoneToken((token) => token + 1);
        perfMark("workbench-generation-commit");
      },
      onFailure: (_error, stableDraft) => {
        track({
          name: "generation_failed",
          properties: { errorCode: "GENERATION_FAILED" },
        });
        if (stableDraft) restoreDraftControls(stableDraft);
        firstDrawingRef.current = false;
        const failedCrop = pendingCropRef.current !== null;
        if (!generationSession.committed) clearOriginalSource();
        else {
          pendingCropRef.current = null;
          restoreReplacement();
        }
        if (failedCrop && !generationSession.committed) {
          uploadGenerationSource(null, initialGenerationDraft);
          setStep("upload");
          setErrorMsg(t.generateFailed);
        }
      },
      onSettled: () => {
        setShowProgress(false);
        perfMark("workbench-generation-settled");
      },
    });
  }, [
    clearOriginalSource,
    restoreReplacement,
    generationSession.committed,
    initialGenerationDraft,
    uploadGenerationSource,
    t.generateFailed,
    markDirty,
    generateFn,
    startGeneration,
    restoreDraftControls,
    generationDraft,
    palette.length,
    toast,
    updateOriginal,
    source,
  ]);

  /**
   * 取消在途生成任务：作废令牌、终止 Worker，并回滚到生成前的稳定提交态。
   *
   * 分工：按钮的卸载（同步、<100ms）由 GenerationCancelControl 负责并打点，
   * 这里只做停机与回滚。两者在同一任务内顺序执行，语义与「先卸载再停机」一致。
   */
  const handleCancelGenerate = useCallback((): void => {
    const cancelled = abortGeneration();
    perfMark("workbench-cancel-abort-end");
    if (!cancelled) return;
    const epoch = cancelEpochRef.current;
    pendingCropRef.current = null;
    // 新建图纸弹窗里取消：停止生成、留在弹窗，图片与取景都保留（D35）。
    const keepDialog = firstDrawingRef.current;
    firstDrawingRef.current = false;
    track({ name: "generation_cancelled", properties: {} });
    window.setTimeout(() => {
      if (epoch !== cancelEpochRef.current) return;
      commitCancel(cancelled.taskId);
      if (cancelled.stableDraft) {
        restoreDraftControls(cancelled.stableDraft);
        restoreReplacement();
      }
      setShowProgress(false);
      if (!cancelled.hadCommit && keepDialog) {
        pendingGenerationSourceRef.current = undefined;
        uploadGenerationSource(null, cancelled.stableDraft ?? initialGenerationDraft);
      } else if (!cancelled.hadCommit) {
        clearOriginalSource();
        pendingGenerationSourceRef.current = undefined;
        uploadGenerationSource(null, initialGenerationDraft);
        setStep("upload");
      }
    }, 0);
  }, [
    abortGeneration,
    commitCancel,
    clearOriginalSource,
    restoreReplacement,
    restoreDraftControls,
    uploadGenerationSource,
    initialGenerationDraft,
  ]);

  // ---------- 上传/裁剪 ----------

  const applyImageCrop = useCallback(
    async (
      rect: Rect,
      image: DecodedImage,
      initial: boolean,
      operation: number,
      draftOverride?: GenerationDraft,
    ): Promise<void> => {
      let cropped: ImageDataLike;
      const legacyDecoder = Boolean(decodeFn || decodeRegionFn);
      const encoded = encodedSourceRef.current;
      if (!legacyDecoder) {
        const result = await activeImageDecoder.region(
          rect,
          MAX_GENERATION_SOURCE_DIMENSION,
        );
        if (imageOperationRef.current !== operation) return;
        if (!result.ok) {
          if (!generationSession.committed) clearOriginalSource();
          else restoreReplacement();
          firstDrawingRef.current = false;
          setStep(generationSession.committed ? "workspace" : "upload");
          setErrorMsg(zhCN.errors[result.code]);
          return;
        }
        cropped = result.image;
      } else if (encoded && decodeRegionFn) {
        const result = await decodeRegionFn(
          encoded.bytes,
          encoded.type,
          rect,
          MAX_GENERATION_SOURCE_DIMENSION,
        );
        if (imageOperationRef.current !== operation) return;
        if (!result.ok) {
          if (!generationSession.committed) clearOriginalSource();
          else restoreReplacement();
          firstDrawingRef.current = false;
          setStep(generationSession.committed ? "workspace" : "upload");
          setErrorMsg(zhCN.errors[result.code]);
          return;
        }
        cropped = result.image;
      } else {
        // Unit/custom-decoder compatibility: map natural crop coordinates
        // back to the bounded RGBA buffer supplied by the injected decoder.
        const naturalWidth = image.naturalWidth ?? image.width;
        const naturalHeight = image.naturalHeight ?? image.height;
        cropped = cropImageData(
          image,
          {
            x: (rect.x * image.width) / naturalWidth,
            y: (rect.y * image.height) / naturalHeight,
            width: (rect.width * image.width) / naturalWidth,
            height: (rect.height * image.height) / naturalHeight,
          },
          MAX_GENERATION_SOURCE_DIMENSION,
        );
      }
      if (imageOperationRef.current !== operation) return;
      // Keep one immutable cross-thread RGBA allocation for the entire
      // generation session; subsequent parameter changes send only params.
      cropped = prepareGenerationSource(cropped);
      const ratio = rect.width / rect.height;
      if (!initial)
        track({
          name: "crop_completed",
          properties: {
            aspectBucket:
              Math.abs(ratio - 1) < 0.05
                ? "square"
                : ratio > 1
                  ? "landscape"
                  : "portrait",
          },
        });
      pendingCropRef.current = { source: cropped, rect };
      // 原图压缩源仍只在当前解码会话中；整图/选区缩小后的缓冲才允许本地保存。
      const rebindRestoredSource = rebindRestoredSourceRef.current || !initial;
      if (!rebindRestoredSource) setCreatedAt(new Date().toISOString());
      const draft = draftOverride ?? { boardProfile, params, paletteSelection };
      if (rebindRestoredSource) {
        replaceGenerationSourceForCrop(cropped, draft);
      } else uploadGenerationSource(cropped, draft);
      // 首版在「新建图纸」弹窗里生成，提交后才进入编辑器（regenerate 的 onSuccess）。
      if (firstDrawingRef.current) firstDrawingRef.current = !rebindRestoredSource;
      if (!firstDrawingRef.current) setStep("workspace");
      regenerate();
      rebindRestoredSourceRef.current = false;
      if (!rebindRestoredSource) {
        setCommunityOrigin(false);
        clearDesignQuery(); // 普通上传生成新设计；恢复项目的原图重绑保留原 id。
      }
    },
    [
      activeImageDecoder,
      boardProfile,
      clearOriginalSource,
      restoreReplacement,
      decodeFn,
      decodeRegionFn,
      generationSession.committed,
      paletteSelection,
      params,
      regenerate,
      replaceGenerationSourceForCrop,
      uploadGenerationSource,
    ],
  );

  const handleUpload = useCallback(
    async ({ bytes, type, name }: ValidImageFile): Promise<void> => {
      if (imageBusyRef.current) return;
      imageBusyRef.current = true;
      const operation = ++imageOperationRef.current;
      setBusy(true);
      setBusyText(t.decoding);
      setErrorMsg(null);
      try {
        if (rebindRestoredSourceRef.current && generationSession.committed) {
          const allowed = await confirm({
            title: t.replaceSourceTitle,
            message: t.replaceSourceMessage,
            confirmLabel: t.confirmRegenerateAction,
            danger: true,
          });
          if (imageOperationRef.current !== operation) return;
          if (!allowed) {
            rebindRestoredSourceRef.current = false;
            setStep("workspace");
            return;
          }
        }
        if (generationSession.committed && !replacementBackupRef.current)
          replacementBackupRef.current = {
            decoded,
            rect: lastCropRect,
            retained: retainedOriginalRef.current,
            encoded: encodedSourceRef.current,
            candidate: candidateOriginalRef.current,
          };
        // 解码器会转移字节，先留一份副本供「公开到豆社」上传原图。
        retainedOriginalRef.current = { bytes: bytes.slice(), type, name };
        perfMark("workbench-upload-handler-enter");
        const legacyDecode =
          decodeFn ?? (decodeRegionFn ? decodeImageFile : null);
        const result = legacyDecode
          ? await legacyDecode(bytes, type)
          : await activeImageDecoder.load(bytes, type, () =>
              setBusyText(t.heicConverting),
            );
        perfMark("workbench-decode-done");
        if (imageOperationRef.current !== operation) return;
        if (!result.ok) {
          if (!generationSession.committed) clearOriginalSource();
          else restoreReplacement();
          setErrorMsg(zhCN.errors[result.code]);
          return;
        }
        const width = result.image.naturalWidth ?? result.image.width;
        const height = result.image.naturalHeight ?? result.image.height;
        const pixels = validatePixelCount(width, height);
        if (!pixels.ok) {
          if (!generationSession.committed) clearOriginalSource();
          else restoreReplacement();
          setErrorMsg(zhCN.errors[pixels.code]);
          return;
        }
        encodedSourceRef.current = legacyDecode ? { bytes, type } : null;
        const cached = await cacheOriginal(
          retainedOriginalRef.current!.bytes,
          type,
          name,
        ).catch(() => null);
        candidateOriginalRef.current = cached
          ? {
              sha256: cached.sha256,
              width,
              height,
              geometry: cropMatrix(
                { x: 0, y: 0, width, height },
                width,
                height,
              ),
            }
          : undefined;
        setDecoded(result.image);
        perfMark("workbench-set-decoded");
        setStep("crop");
        perfMark("workbench-apply-crop-done");
      } catch {
        if (imageOperationRef.current !== operation) return;
        if (!generationSession.committed) clearOriginalSource();
        else restoreReplacement();
        setErrorMsg(zhCN.errors.DECODE_FAILED);
      } finally {
        if (imageOperationRef.current === operation) {
          imageBusyRef.current = false;
          setBusy(false);
        }
      }
    },
    [
      activeImageDecoder,
      clearOriginalSource,
      restoreReplacement,
      decoded,
      lastCropRect,
      confirm,
      decodeFn,
      decodeRegionFn,
      generationSession.committed,
      t,
    ],
  );

  const handleCropConfirm = useCallback(
    async (rect: Rect, draftOverride?: GenerationDraft): Promise<void> => {
      if (!decoded || imageBusyRef.current) return;
      imageBusyRef.current = true;
      const operation = ++imageOperationRef.current;
      setBusy(true);
      setBusyText(t.decoding);
      setErrorMsg(null);
      try {
        if (
          generationSession.hasManualEdits &&
          !(await confirm({
            title: t.confirmRegenerateTitle,
            message: t.confirmRegenerate,
            confirmLabel: t.confirmRegenerateAction,
            danger: true,
          }))
        )
          return;
        if (imageOperationRef.current === operation)
          await applyImageCrop(
            rect,
            decoded,
            !generationSession.committed,
            operation,
            draftOverride,
          );
      } catch {
        firstDrawingRef.current = false;
        if (imageOperationRef.current !== operation) return;
        if (!generationSession.committed) clearOriginalSource();
        else restoreReplacement();
        setErrorMsg(zhCN.errors.DECODE_FAILED);
        setStep("workspace");
      } finally {
        if (imageOperationRef.current === operation) {
          imageBusyRef.current = false;
          setBusy(false);
        }
      }
    },
    [
      applyImageCrop,
      clearOriginalSource,
      restoreReplacement,
      confirm,
      decoded,
      generationSession.hasManualEdits,
      generationSession.committed,
      t.decoding,
      t.confirmRegenerate,
      t.confirmRegenerateAction,
      t.confirmRegenerateTitle,
    ],
  );

  const paletteChoices = useMemo(
    () => buildPaletteChoices(cloudPalettes),
    [cloudPalettes],
  );

  /** 弹窗里选的色板值 → 生成草稿的色板（套装档位回到全色）与自定义色板 id。 */
  const draftFromChoice = useCallback(
    (
      paletteValue: string,
      nextBoardProfile: GenerationDraft["boardProfile"],
      nextParams: GenerationParams,
    ): { draft: GenerationDraft; customId: string | null } | null => {
      const choice = findPaletteChoice(paletteChoices, paletteValue);
      if (!choice) return null;
      const boardProfileId = defaultBoardProfileForPalette(
        choice.palette,
        nextBoardProfile,
      );
      return {
        draft: {
          boardProfile: boardProfileId,
          params: nextParams,
          paletteSelection: { palette: choice.palette, kitTier: 0 },
        },
        customId: paletteValue.startsWith("custom:")
          ? paletteValue.slice("custom:".length)
          : null,
      };
    },
    [paletteChoices],
  );

  /** 「新建图纸」弹窗的「生成图纸」：带着弹窗里的设置走同一条裁剪 → 生成管线。 */
  const handleNewDrawing = useCallback(
    (settings: NewDrawingSettings): void => {
      const resolved = draftFromChoice(settings.paletteValue, settings.boardProfile, {
        ...params,
        targetWidth: settings.width,
        targetColorCount: settings.colors,
        backgroundRemoval: settings.removeBackground,
      });
      if (!resolved) return;
      setCustomPaletteId(resolved.customId);
      updateGenerationDraft(resolved.draft);
      firstDrawingRef.current = true;
      void handleCropConfirm(settings.rect, resolved.draft);
    },
    [draftFromChoice, handleCropConfirm, params, updateGenerationDraft],
  );

  const handleCropCancel = useCallback((): void => {
    firstDrawingRef.current = false;
    imageOperationRef.current += 1;
    imageBusyRef.current = false;
    setBusy(false);
    setErrorMsg(null);
    // 编辑器里「选择原图」后取消裁剪：原图纸保持原样，之后的选图不再按重绑处理。
    rebindRestoredSourceRef.current = false;
    if (generationSession.committed) {
      restoreReplacement();
      setStep("workspace");
    } else {
      clearOriginalSource();
      setStep("upload");
    }
  }, [clearOriginalSource, restoreReplacement, generationSession.committed]);

  // ---------- 参数/色板/编辑 ----------

  const confirmRegeneration = useCallback(async (): Promise<boolean> => {
    if (!generationSession.hasManualEdits) return true;
    return confirm({
      title: t.confirmRegenerateTitle,
      message: t.confirmRegenerate,
      confirmLabel: t.confirmRegenerateAction,
      danger: true,
    });
  }, [
    confirm,
    generationSession.hasManualEdits,
    t.confirmRegenerate,
    t.confirmRegenerateAction,
    t.confirmRegenerateTitle,
  ]);

  const handleParamsChange = useCallback(
    (p: GenerationParams): void => {
      if (!source) return;
      void (async () => {
        if (!(await confirmRegeneration())) {
          // Give the debounced panel a new controlled value identity so its draft
          // is reset to the last committed parameters.
          restoreDraftControls(generationDraft);
          return;
        }
        updateGenerationDraft({ ...generationDraft, params: p });
        regenerate();
      })();
    },
    [
      source,
      generationDraft,
      regenerate,
      confirmRegeneration,
      restoreDraftControls,
      updateGenerationDraft,
    ],
  );

  /**
   * 换色板（H-1）。
   *
   * 两条路径，规则是「永不丢用户的工作」：
   * - 已有图纸 → 始终做图纸级重映射，色板与自动兼容规格进入同一个撤销快照。
   *   后续调参时再从本地生成源按新色板重新生成，避免一次选择产生两个不可分割状态。
   * - 尚未开始的空白起稿 → 只更新草稿色板与兼容规格，不创建图纸或脏状态。
   */
  const handlePaletteSelect = useCallback(
    (value: string): void => {
      if (value === "__custom") return; // 导入的自定义色板不可再切换（T18 提供管理）
      const resolved = ((): {
        palette: PaletteColor[];
        projectPalette: ProjectPalette;
        customId: string | null;
      } | null => {
        if (value.startsWith("custom:")) {
          const paletteId = value.slice("custom:".length);
          const found = cloudPalettes.find((p) => p.id === paletteId);
          if (!found) return null;
          return {
            palette: found.colors,
            projectPalette: {
              kind: "custom",
              colors: found.colors.map((c) => ({
                code: c.code ?? "",
                hex: c.hex,
              })),
            },
            customId: found.id,
          };
        }
        const paletteId = value.startsWith("builtin:")
          ? value.slice("builtin:".length)
          : value;
        if (!isBuiltinPaletteId(paletteId)) return null;
        return {
          palette: [...getBuiltinPalette(paletteId).engineColors],
          projectPalette: { kind: "builtin", brand: paletteId },
          customId: null,
        };
      })();
      if (!resolved) return;

      const nextBoardProfile = defaultBoardProfileForPalette(
        resolved.projectPalette,
        boardProfile,
      );
      const nextKitTier = kitTier > resolved.palette.length ? 0 : kitTier;
      const nextPaletteSelection: PaletteSelection = {
        palette: resolved.projectPalette,
        kitTier: nextKitTier,
      };
      const appliedPalette = paletteColorsForSelection(nextPaletteSelection);

      const committed = generationSession.committed;
      if (committed) {
        paletteIdentityUndoRef.current = {
          snapshot: committed,
          customPaletteId,
        };
      }
      setCustomPaletteId(resolved.customId);
      if (!committed) {
        updateGenerationDraft({
          boardProfile: nextBoardProfile,
          params,
          paletteSelection: nextPaletteSelection,
        });
        return;
      }

      const result = remapPattern(committed.pattern, appliedPalette);
      remapPalette({
        pattern: result.pattern,
        stats: result.stats,
        total: result.totalBeadCount,
        paletteSelection: nextPaletteSelection,
        boardProfile: nextBoardProfile,
      });
      const chosenName =
        paletteChoices.find((choice) => choice.value === value)?.name ??
        zhCN.workbench.customPaletteLabel;
      notifyUndoable(
        nextBoardProfile === boardProfile
          ? zhCN.editorWorkspace.colors.paletteDone(chosenName)
          : zhCN.editorWorkspace.colors.paletteSpecDone(
              chosenName,
              getBoardProfile(nextBoardProfile).displayName,
            ),
      );
      markDirty();
    },
    [
      cloudPalettes,
      boardProfile,
      customPaletteId,
      generationSession.committed,
      markDirty,
      kitTier,
      notifyUndoable,
      paletteChoices,
      params,
      remapPalette,
      updateGenerationDraft,
    ],
  );

  const handleBoardProfileSelect = useCallback(
    (value: string): void => {
      if (!isBoardProfileId(value) || value === boardProfile) return;
      const compatible = compatibleBoardProfilesForPalette(projectPalette).some(
        (profile) => profile.id === value,
      );
      const committed = generationSession.committed;
      if (!compatible || generating) return;
      if (!committed) {
        updateGenerationDraft({ ...generationDraft, boardProfile: value });
        return;
      }
      remapPalette({
        pattern: committed.pattern,
        stats: committed.stats,
        total: committed.total,
        paletteSelection: committed.paletteSelection,
        boardProfile: value,
      });
      notifyUndoable(
        zhCN.editorWorkspace.adjust.specDone(getBoardProfile(value).displayName),
      );
      markDirty();
    },
    [
      boardProfile,
      generating,
      generationDraft,
      generationSession.committed,
      markDirty,
      notifyUndoable,
      projectPalette,
      remapPalette,
      updateGenerationDraft,
    ],
  );

  const handlePatternChange = useCallback(
    (p: Pattern): void => {
      if (generating) return;
      const nextStats = computeStats(p.cells);
      const nextTotal = totalBeadCount(nextStats);
      originalByPatternRef.current.set(p, originalRef.current);
      commitManualEdit(p, nextStats, nextTotal);
      markDirty();
    },
    [commitManualEdit, generating, markDirty],
  );

  /**
   * 空白起稿（H-2）：不经过上传与生成，直接把一张全透明图纸提交进会话。
   * 没有生成源，因此参数面板保持锁定（改参数需要原图），但可以修补、换色板、导出。
   */
  const startBlank = useCallback(
    (width: number, height: number, draft?: GenerationDraft): void => {
      if (rebindRestoredSourceRef.current) return;
      clearOriginalSource();
      const blank = createBlankPattern(width, height);
      const base = draft ?? { boardProfile, params, paletteSelection };
      restoreGeneration({
        ...base,
        params: { ...base.params, targetWidth: width },
        pattern: blank,
        stats: [],
        total: 0,
        engineVersion: ENGINE_VERSION,
      });
      setStep("workspace");
      setTab("edit"); // 空白图纸的第一步一定是画，直接落在修补页签
      markDirty();
      showDesignQuery(designIdRef.current);
    },
    [
      boardProfile,
      clearOriginalSource,
      markDirty,
      paletteSelection,
      params,
      restoreGeneration,
    ],
  );

  const handleBlankCreate = useCallback(
    (settings: BlankCanvasSettings): void => {
      const resolved = draftFromChoice(settings.paletteValue, settings.boardProfile, params);
      if (!resolved) return;
      setCustomPaletteId(resolved.customId);
      setBlankOpen(false);
      startBlank(settings.width, settings.height, resolved.draft);
    },
    [draftFromChoice, params, startBlank],
  );

  /**
   * 换档位（H-3）：把当前色板按档位裁成可用色子集后应用。
   * 有生成源 → 用子集重新生成；没有源 → 对现有图纸重映射（保留修补）。
   */
  const handleKitTierChange = useCallback(
    (tier: number): void => {
      void (async () => {
        if (!isKitTierAvailableForPalette(tier, projectPalette)) return;
        const normalizedTier = tier;
        if (source && !(await confirmRegeneration())) return;

        const nextPaletteSelection: PaletteSelection = {
          palette: projectPalette,
          kitTier: normalizedTier,
        };
        const kit = paletteColorsForSelection(nextPaletteSelection);
        const committed = generationSession.committed;
        if (source) {
          updateGenerationDraft({
            boardProfile,
            params,
            paletteSelection: nextPaletteSelection,
          });
          regenerate();
          return;
        }
        if (!committed) return;
        const result = remapPattern(committed.pattern, kit);
        remapPalette({
          pattern: result.pattern,
          stats: result.stats,
          total: result.totalBeadCount,
          paletteSelection: nextPaletteSelection,
          boardProfile,
        });
        notifyUndoable(
          zhCN.editorWorkspace.colors.kitDone(normalizedTier, result.changedCells),
        );
        markDirty();
      })();
    },
    [
      confirmRegeneration,
      generationSession.committed,
      markDirty,
      boardProfile,
      notifyUndoable,
      params,
      projectPalette,
      regenerate,
      remapPalette,
      source,
      updateGenerationDraft,
    ],
  );

  const handleUndoRegeneration = useCallback((): void => {
    const snapshot = generationSession.regenerationUndo;
    if (!snapshot || generating) return;
    const paletteIdentity = paletteIdentityUndoRef.current;
    if (originalByPatternRef.current.has(snapshot.pattern))
      updateOriginal(originalByPatternRef.current.get(snapshot.pattern));
    if (
      generationSession.regenerationUndoSource !==
      generationSession.committedSource
    ) {
      pendingGenerationSourceRef.current =
        generationSession.regenerationUndoSource;
      setLastCropRect(
        generationSession.regenerationUndoSource
          ? cropRectsRef.current.get(generationSession.regenerationUndoSource)
          : undefined,
      );
    }
    undoRegeneration();
    if (paletteIdentity?.snapshot === snapshot) {
      setCustomPaletteId(paletteIdentity.customPaletteId);
    } else {
      setCustomPaletteId((current) =>
        resolveCustomPaletteId(snapshot.paletteSelection.palette, current),
      );
    }
    paletteIdentityUndoRef.current = null;
    markDirty();
  }, [
    generationSession.committedSource,
    generationSession.regenerationUndoSource,
    generationSession.regenerationUndo,
    generating,
    markDirty,
    resolveCustomPaletteId,
    undoRegeneration,
    updateOriginal,
  ]);
  useEffect(() => {
    undoRegenerationRef.current = handleUndoRegeneration;
  }, [handleUndoRegeneration]);

  useEffect(() => {
    const bound = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          designId: string;
          sha256: string;
          assetId: string;
        }>
      ).detail;
      if (
        detail.designId === designIdRef.current &&
        originalRef.current?.sha256 === detail.sha256
      )
        updateOriginal({ ...originalRef.current, assetId: detail.assetId });
    };
    window.addEventListener("beadhue:original-bound", bound);
    return () => window.removeEventListener("beadhue:original-bound", bound);
  }, [updateOriginal]);

  // ---------- 保存 ----------

  const buildProject = useCallback((): ProjectFile | null => {
    const committed = selectCommittedSnapshot(generationSession);
    if (!committed) return null;
    return {
      ...(originalRef.current ? { original: originalRef.current } : {}),
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      ...(communityOrigin ? { communityOrigin: true as const } : {}),
      engineVersion: committed.engineVersion,
      boardProfile: committed.boardProfile,
      name: name.trim() || zhCN.project.unnamed,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paletteSelection: committed.paletteSelection,
      params: committed.params,
      pattern: committed.pattern,
    };
  }, [generationSession, name, createdAt, communityOrigin]);
  const buildProjectRef = useRef(buildProject);
  useEffect(() => {
    buildProjectRef.current = buildProject;
  }, [buildProject]);

  const loadCommittedProject = useCallback(
    (
      project: ProjectFile,
      localSource: LocalGenerationSourceV1 | null = null,
    ): void => {
      const computed = computeStats(project.pattern.cells);
      const restoredTotal = totalBeadCount(computed);
      const commit = {
        boardProfile: project.boardProfile,
        params: project.params,
        paletteSelection: project.paletteSelection,
        pattern: project.pattern,
        stats: computed,
        total: restoredTotal,
        engineVersion: project.engineVersion,
      };
      setName(project.name);
      setCreatedAt(project.createdAt);
      setCommunityOrigin(project.communityOrigin === true);
      clearOriginalSource();
      updateOriginal(project.original);
      originalByPatternRef.current.set(project.pattern, project.original);
      setCustomPaletteId(null);
      restoreGeneration(commit);
      if (localSource && !project.original) {
        const restoredSource = prepareGenerationSource(
          imageDataFromLocalGenerationSource(localSource),
        );
        if (project.original)
          originalBySourceRef.current.set(restoredSource, project.original);
        reuploadGenerationSource(restoredSource, commit);
      }
      pendingGenerationSourceRef.current = undefined;
      dirtyRef.current = false;
      setSaveState("saved");
      setStep("workspace");
    },
    [
      clearOriginalSource,
      restoreGeneration,
      reuploadGenerationSource,
      updateOriginal,
    ],
  );

  /**
   * 把交接过来的完整原图绑定到刚恢复的设计（D49：引用者取回作者原图）。
   * 只绑定、不重新生成：作者的手工修补保持原样，之后裁剪 / 改格数 / 改颜色数才会基于原图重算。
   * 成功后 800px 生成源随下一次保存落入本地库，刷新后仍可调参。
   */
  const bindOriginalToDesign = useCallback(
    async (
      original: { bytes: Uint8Array; type: ImageType; name: string },
      project: ProjectFile,
    ): Promise<boolean> => {
      if (imageBusyRef.current) return false;
      imageBusyRef.current = true;
      const operation = ++imageOperationRef.current;
      setBusy(true);
      setBusyText(t.decoding);
      try {
        const retained = {
          bytes: original.bytes.slice(),
          type: original.type,
          name: original.name,
        };
        const legacyDecode =
          decodeFn ?? (decodeRegionFn ? decodeImageFile : null);
        const result = legacyDecode
          ? await legacyDecode(original.bytes, original.type)
          : await activeImageDecoder.load(original.bytes, original.type, () =>
              setBusyText(t.heicConverting),
            );
        if (imageOperationRef.current !== operation) return false;
        if (!result.ok) {
          setErrorMsg(zhCN.errors[result.code]);
          return false;
        }
        const width = result.image.naturalWidth ?? result.image.width;
        const height = result.image.naturalHeight ?? result.image.height;
        if (!validatePixelCount(width, height).ok) {
          setErrorMsg(zhCN.errors.TOO_MANY_PIXELS);
          return false;
        }
        const cached = await cacheOriginal(
          retained.bytes,
          retained.type,
          retained.name,
        );
        const aligned =
          project.original?.sha256 === cached.sha256
            ? { ...project.original, width, height }
            : { sha256: cached.sha256, width, height };
        retainedOriginalRef.current = retained;
        updateOriginal(aligned);
        setDecoded(result.image);
        encodedSourceRef.current = legacyDecode
          ? { bytes: retained.bytes, type: retained.type }
          : null;
        if (!aligned.geometry) {
          markDirty();
          return true;
        }
        const rect: Rect = originalRegion(aligned.geometry, width, height);
        let bounded: ImageDataLike;
        if (!legacyDecode) {
          const region = await activeImageDecoder.region(
            rect,
            MAX_GENERATION_SOURCE_DIMENSION,
          );
          if (imageOperationRef.current !== operation) return false;
          if (!region.ok) {
            setErrorMsg(zhCN.errors[region.code]);
            return false;
          }
          bounded = region.image;
        } else if (decodeRegionFn) {
          const region = await decodeRegionFn(
            retained.bytes,
            retained.type,
            rect,
            MAX_GENERATION_SOURCE_DIMENSION,
          );
          if (imageOperationRef.current !== operation) return false;
          if (!region.ok) {
            setErrorMsg(zhCN.errors[region.code]);
            return false;
          }
          bounded = region.image;
        } else {
          bounded = cropImageData(
            result.image,
            {
              x: (rect.x / width) * result.image.width,
              y: (rect.y / height) * result.image.height,
              width: (rect.width / width) * result.image.width,
              height: (rect.height / height) * result.image.height,
            },
            MAX_GENERATION_SOURCE_DIMENSION,
          );
        }
        const source = prepareGenerationSource(
          orientOriginalRegion(bounded, aligned.geometry),
        );
        originalBySourceRef.current.set(source, aligned);
        encodedSourceRef.current = legacyDecode
          ? { bytes: retained.bytes, type: retained.type }
          : null;
        retainedOriginalRef.current = retained;
        setDecoded(result.image);
        cropRectsRef.current.set(source, rect);
        setLastCropRect(rect);
        reuploadGenerationSource(source, {
          boardProfile: project.boardProfile,
          params: project.params,
          paletteSelection: project.paletteSelection,
        });
        pendingGenerationSourceRef.current = source;
        setErrorMsg(null);
        markDirty();
        return true;
      } catch {
        if (imageOperationRef.current === operation)
          setErrorMsg(zhCN.errors.DECODE_FAILED);
        return false;
      } finally {
        if (imageOperationRef.current === operation) {
          imageBusyRef.current = false;
          setBusy(false);
        }
      }
    },
    [
      activeImageDecoder,
      decodeFn,
      decodeRegionFn,
      markDirty,
      reuploadGenerationSource,
      t.decoding,
      t.heicConverting,
      updateOriginal,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    const imageReset = requestAnimationFrame(() => setOriginalImage(null));
    const reference = originalRef.current;
    if (!reference) return () => cancelAnimationFrame(imageReset);
    const missing = (): void => {
      if (!cancelled)
        setOriginalImageState({ sha256: reference.sha256, state: "missing" });
    };
    void (async () => {
      let cached = await getCachedOriginal(reference.sha256).catch(() => null);
      if (!cached && reference.assetId) {
        const response = await fetch(`/api/designs/${designId}/original`, {
          cache: "no-store",
        });
        if (!response.ok) return missing();
        const bytes = new Uint8Array(await response.arrayBuffer());
        const type = sniffImageType(bytes);
        if (type === "unknown") return missing();
        cached = await cacheOriginal(bytes, type, "original");
        if (cached.sha256 !== reference.sha256) return missing();
      }
      if (!cached) return missing();
      if (cancelled) return;
      retainedOriginalRef.current = {
        bytes: new Uint8Array(cached.bytes),
        type: cached.type,
        name: cached.name,
      };
      let bytes = new Uint8Array(cached.bytes);
      if (cached.type === "heic") {
        const { convertHeicWithWasm } = await import("@/lib/image/decode");
        bytes = new Uint8Array(await convertHeicWithWasm(bytes));
      }
      if (cancelled) return;
      objectUrl = URL.createObjectURL(new Blob([bytes]));
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (!cancelled) {
        setOriginalImage(image);
        setOriginalImageState({ sha256: reference.sha256, state: "ready" });
        const project = buildProjectRef.current();
        if (
          !sourceRef.current &&
          project?.original?.sha256 === reference.sha256 &&
          project.original.geometry
        ) {
          await bindOriginalToDesign(
            {
              bytes: new Uint8Array(cached.bytes),
              type: cached.type,
              name: cached.name,
            },
            project,
          );
        }
      }
    })().catch(missing);
    return () => {
      cancelled = true;
      cancelAnimationFrame(imageReset);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [original?.sha256, original?.assetId, designId, bindOriginalToDesign]);

  const consumeSyncOutcome = useCallback(
    async (adapter: StorageAdapter, outcome: SyncOutcome): Promise<void> => {
      const activeId = designIdRef.current;
      const scheduleConflictCopySave = (): void => {
        // 冲突副本是在本轮同步快照之后创建的，必须经过一次正常 save→sync 才能确认上云。
        // 即使用户没有继续编辑，也不能把本地 conflict 记录留到下一次刷新或 online 事件。
        dirtyRef.current = true;
        setSaveState("dirty");
        scheduleAutosave();
      };
      const conflict = outcome.conflictCopies.find(
        (item) => item.originalId === activeId,
      );
      if (conflict) {
        const records = await adapter.getAll();
        if (designIdRef.current !== activeId) return;
        const conflictRecord = records.find(
          (item) => item.id === conflict.conflictId,
        );
        const conflictProject = conflictRecord
          ? parseStoredProject(conflictRecord.projectJson)
          : null;
        // 若存储快照之后界面又产生了未保存编辑，就把最新提交态并入已创建的冲突副本。
        const currentProject = dirtyRef.current
          ? buildProjectRef.current()
          : null;
        if (currentProject && conflictProject) {
          const capturedEditGen = editGenRef.current;
          const latestName = conflictName(
            t.conflictCopyName(currentProject.name),
            records
              .filter((item) => item.id !== conflict.conflictId)
              .map((item) => item.name),
          );
          const latestProject = {
            ...currentProject,
            name: latestName,
            updatedAt: new Date().toISOString(),
          };
          const latestSource =
            pendingGenerationSourceRef.current === undefined
              ? sourceRef.current
              : pendingGenerationSourceRef.current;
          await adapter.put(
            {
              ...createDesignRecord(
                conflict.conflictId,
                latestProject,
                renderThumbnail(
                  latestProject.pattern,
                  256,
                  getBoardProfile(latestProject.boardProfile).boardCols,
                ),
              ),
              syncState: "conflict",
            },
            latestSource
              ? replaceGenerationSource(
                  createLocalGenerationSource(latestSource),
                )
              : CLEAR_GENERATION_SOURCE,
          );
          if (designIdRef.current !== activeId) return;
          setActiveDesignId(conflict.conflictId);
          if (editGenRef.current === capturedEditGen) {
            if (pendingGenerationSourceRef.current === latestSource) {
              pendingGenerationSourceRef.current = undefined;
            }
            setName(latestName);
          }
        } else {
          setActiveDesignId(conflict.conflictId);
          if (conflictProject) setName(conflictProject.name);
        }
        scheduleConflictCopySave();
        window.history.replaceState(
          null,
          "",
          `/app?id=${encodeURIComponent(conflict.conflictId)}`,
        );
        setSyncNotice(t.syncConflictCopy);
        setCloudSaveState("pending");
        return;
      }
      if (outcome.overwrittenByCloud.includes(activeId)) {
        const preserveCurrentEditsAsConflict = async (
          records: Awaited<ReturnType<StorageAdapter["getAll"]>>,
        ): Promise<boolean> => {
          if (designIdRef.current !== activeId) return true;
          if (!dirtyRef.current) return false;
          const currentProject = buildProjectRef.current();
          if (!currentProject) return true;

          // 从这一刻起 project/source/edit generation 属于 activeId 的同一快照。
          // put 在途时 UI 仍可继续编辑，所以写后必须用代际决定能否清脏。
          const capturedEditGen = editGenRef.current;
          const capturedSource =
            pendingGenerationSourceRef.current === undefined
              ? sourceRef.current
              : pendingGenerationSourceRef.current;
          const conflictId = newDesignId();
          const conflictProjectName = conflictName(
            t.conflictCopyName(currentProject.name),
            records.map((item) => item.name),
          );
          const conflictProject = {
            ...currentProject,
            name: conflictProjectName,
            updatedAt: new Date().toISOString(),
          };
          await adapter.put(
            {
              ...createDesignRecord(
                conflictId,
                conflictProject,
                renderThumbnail(
                  conflictProject.pattern,
                  256,
                  getBoardProfile(conflictProject.boardProfile).boardCols,
                ),
              ),
              syncState: "conflict",
            },
            capturedSource
              ? replaceGenerationSource(
                  createLocalGenerationSource(capturedSource),
                )
              : CLEAR_GENERATION_SOURCE,
          );
          if (designIdRef.current !== activeId) return true;

          setActiveDesignId(conflictId);
          window.history.replaceState(
            null,
            "",
            `/app?id=${encodeURIComponent(conflictId)}`,
          );
          if (editGenRef.current === capturedEditGen) {
            if (pendingGenerationSourceRef.current === capturedSource) {
              pendingGenerationSourceRef.current = undefined;
            }
            setName(conflictProjectName);
          }
          scheduleConflictCopySave();
          setSyncNotice(t.syncConflictCopy);
          setCloudSaveState("pending");
          return true;
        };

        const records = await adapter.getAll();
        if (designIdRef.current !== activeId) return;
        if (await preserveCurrentEditsAsConflict(records)) return;
        if (designIdRef.current !== activeId) return;
        const record = records.find((item) => item.id === activeId);
        const remoteProject = record
          ? parseStoredProject(record.projectJson)
          : null;
        if (remoteProject) {
          const loadEditGen = editGenRef.current;
          const localSource = await adapter.getGenerationSource(activeId);
          if (designIdRef.current !== activeId) return;
          if (dirtyRef.current || editGenRef.current !== loadEditGen) {
            const latestRecords = await adapter.getAll();
            if (designIdRef.current !== activeId) return;
            await preserveCurrentEditsAsConflict(latestRecords);
            return;
          }
          loadCommittedProject(remoteProject, localSource);
          setSyncNotice(t.syncCloudUpdated);
        } else {
          // 另一台设备删除了当前这份无本地改动的设计。
          clearOriginalSource();
          pendingGenerationSourceRef.current = undefined;
          setActiveDesignId(newDesignId());
          uploadGenerationSource(null, initialGenerationDraft);
          setStep("upload");
          clearDesignQuery();
          setSyncNotice(t.syncCloudDeleted);
        }
      }
      // 同步按设计隔离：其他设计损坏或不可用，不能降级已经确认上传的当前设计；
      // 反之，本轮没有确认当前设计时也不能声称云端同步成功。
      setCloudSaveState(
        !dirtyRef.current && outcome.syncedIds.includes(designIdRef.current)
          ? "synced"
          : "pending",
      );
    },
    [
      clearOriginalSource,
      initialGenerationDraft,
      loadCommittedProject,
      scheduleAutosave,
      setActiveDesignId,
      t,
      uploadGenerationSource,
    ],
  );

  const syncCloud = useCallback(
    async (adapter: StorageAdapter): Promise<void> => {
      if (authStatus.kind !== "user") return;
      setCloudSaveState("syncing");
      const confirmedIds = new Set<string>();
      try {
        const outcome = await enqueueDesignSync(
          adapter,
          createBeadhueApi(),
          async (current) => {
            for (const id of current.syncedIds) confirmedIds.add(id);
            await consumeSyncOutcome(adapter, current);
          },
        );
        if (!outcome) setCloudSaveState("pending");
      } catch {
        // 本地保存已经成功；durable marker 会留到 online 或下次启动重试。
        // 其他设计的问题可以保留重试标记，但不能抹掉当前设计独立确认的云端状态。
        const activeId = designIdRef.current;
        let activeDesignSynced = confirmedIds.has(activeId);
        if (!activeDesignSynced) {
          try {
            const activeRecord = (await adapter.getAll()).find(
              (record) => record.id === activeId,
            );
            activeDesignSynced = activeRecord?.syncState === "synced";
          } catch {
            // 状态读取失败时保持保守的待同步状态，durable marker 会继续负责重试。
          }
        }
        setCloudSaveState(
          designIdRef.current === activeId &&
            !dirtyRef.current &&
            activeDesignSynced
            ? "synced"
            : "pending",
        );
      }
    },
    [authStatus.kind, consumeSyncOutcome],
  );

  const doSave = useCallback(async (): Promise<boolean> => {
    const adapter = adapterRef.current;
    if (!adapter) {
      setSaveState("unavailable");
      return false;
    }
    const project = buildProject();
    if (!project) return false;
    const saveDesignId = designIdRef.current;
    const pendingSource = pendingGenerationSourceRef.current;
    const genBefore = editGenRef.current;
    setSaveState("saving");
    try {
      const thumbnail = renderThumbnail(
        project.pattern,
        256,
        getBoardProfile(project.boardProfile).boardCols,
      );
      const writeResult = await withDesignStorageLock(
        async (): Promise<"saved" | "stale"> => {
          // 排队期间同步可能已经把活动设计切到了冲突副本，用户也可能继续编辑。
          // 拿到锁后必须重新核对保存令牌，旧快照绝不能再写回原设计。
          if (
            designIdRef.current !== saveDesignId ||
            editGenRef.current !== genBefore
          ) {
            return "stale";
          }
          const shouldWriteSource =
            pendingSource !== undefined &&
            pendingGenerationSourceRef.current === pendingSource &&
            designIdRef.current === saveDesignId;
          await adapter.put(
            createDesignRecord(saveDesignId, project, thumbnail),
            shouldWriteSource
              ? pendingSource
                ? replaceGenerationSource(
                    createLocalGenerationSource(pendingSource),
                  )
                : CLEAR_GENERATION_SOURCE
              : undefined,
          );
          if (
            shouldWriteSource &&
            pendingGenerationSourceRef.current === pendingSource
          ) {
            pendingGenerationSourceRef.current = undefined;
          }
          return "saved";
        },
      );
      if (writeResult === "stale") {
        // 旧保存令牌不得覆盖同步回调或新编辑已经设置的状态。
        if (dirtyRef.current) scheduleAutosave();
        return false;
      }
      // 本地持久化是保存成功的依据；云端同步可持久重试且会合并突发请求，
      // 离线云端不能反过来把已经成功的本地保存标成失败。
      void syncCloud(adapter)
        .then(async () => {
          if (
            authStatus.kind === "user" &&
            project.original &&
            !project.original.assetId
          ) {
            await enqueueOriginalUpload({
              url: `/api/designs/${saveDesignId}/original`,
              designId: saveDesignId,
              sha256: project.original.sha256,
              email: authStatus.email,
            });
          }
        })
        .catch(() => undefined);
      setSavedNames((prev) =>
        prev.includes(project.name) ? prev : [...prev, project.name],
      );
      // 仅当保存期间没有新的编辑才清脏；否则保持脏标记（自动保存会再兜底一次）
      if (editGenRef.current === genBefore) {
        dirtyRef.current = false;
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      track({
        name: "design_saved",
        properties: {
          source: communityOrigin
            ? "community"
            : authStatus.kind === "user"
              ? "cloud"
              : "local",
        },
      });
      return true;
    } catch (error) {
      setSaveState(isQuotaError(error) ? "quota" : "error");
      return false;
    }
  }, [
    authStatus.kind,
    authStatus.email,
    buildProject,
    communityOrigin,
    scheduleAutosave,
    syncCloud,
  ]);

  /**
   * 分享前的准备（批次 K）：把当前设计**确实**保存并推到云端。
   *
   * 为什么不用「云端：已同步」徽标做判断：那个状态表示上一次同步跑完了，
   * 一张刚生成、还没落盘的设计也会显示已同步——实测点分享会得到「设计不存在」。
   * 这里直接走一遍保存 + 同步，再由服务端的查询结果说话。
   */
  const prepareShare = useCallback(async (): Promise<boolean> => {
    const adapter = adapterRef.current;
    if (!adapter || authStatus.kind !== "user") return false;
    if (dirtyRef.current || saveState !== "saved") {
      const saved = await doSave();
      if (!saved) return false;
    }
    // doSave 内部会触发一次同步，但它是 fire-and-forget；这里显式等一次，
    // 保证 POST /share 之前云端已经有这张设计。
    await syncCloud(adapter);
    return true;
  }, [authStatus.kind, doSave, saveState, syncCloud]);

  // 登录工作台启动时先恢复 durable pending；网络恢复后在当前页面自动重试。
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!storageReady || authStatus.kind !== "user" || !adapter) return;
    const retry = (): void => {
      void syncCloud(adapter);
    };
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [authStatus.kind, storageReady, syncCloud]);

  // 自动保存：置脏后 1s 防抖（spec §F8）。排程在 markDirty 里完成；
  // 这里只负责保持 doSave 引用最新，并在卸载时清掉未触发的定时器。
  useEffect(() => {
    doSaveRef.current = step !== "upload" ? doSave : null;
  }, [doSave, step]);

  /**
   * 跟拼进度的读取（G-1）：设计或图纸尺寸变化时重新对齐。
   * 尺寸不匹配（重新生成或旋转过）就从零开始——把旧标记套到新图纸上会错位。
   */
  useEffect(() => {
    if (!storageReady || patternWidth === null || patternHeight === null)
      return;
    const adapter = adapterRef.current;
    if (!adapter) {
      setStitchProgress(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stored = await adapter.getStitchProgress(designId);
        if (cancelled) return;
        setStitchProgress(
          isProgressCompatible(stored, {
            width: patternWidth,
            height: patternHeight,
          })
            ? stored
            : createStitchProgress(patternWidth, patternHeight),
        );
      } catch {
        if (!cancelled) setStitchProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [designId, patternHeight, patternWidth, storageReady]);

  /**
   * 串行排空跟拼写入；同一时刻最多一个 IndexedDB 写请求。
   * 在途请求结束后只写 pending 中最后一个快照，中间状态无需逐个落库。
   */
  const drainStitchWrites = useCallback((retry = false): Promise<void> => {
    if (retry) {
      stitchWriteFailedRef.current = false;
      setStitchSaveError(false);
    }
    if (activeStitchWriteRef.current) return activeStitchWriteRef.current;
    if (stitchWriteFailedRef.current || !pendingStitchWriteRef.current)
      return Promise.resolve();

    const run = async (): Promise<void> => {
      while (pendingStitchWriteRef.current && !stitchWriteFailedRef.current) {
        const write = pendingStitchWriteRef.current;
        pendingStitchWriteRef.current = null;
        try {
          await write.adapter.putStitchProgress(write.designId, write.progress);
          setStitchSaveError(false);
        } catch {
          // 若等待期间已有更新，保留更新后的快照；否则把失败快照放回队列。
          if (!pendingStitchWriteRef.current)
            pendingStitchWriteRef.current = write;
          stitchWriteFailedRef.current = true;
          setStitchSaveError(true);
          break;
        }
      }
    };

    const active = run().finally(() => {
      if (activeStitchWriteRef.current === active)
        activeStitchWriteRef.current = null;
    });
    activeStitchWriteRef.current = active;
    return active;
  }, []);

  const updateStitchProgress = useCallback(
    (next: StitchProgress): void => {
      setStitchProgress(next);
      const adapter = adapterRef.current;
      if (!adapter) return;
      pendingStitchWriteRef.current = {
        adapter,
        designId: designIdRef.current,
        progress: { ...next, done: next.done.slice(0) },
      };
      // 新操作本身也是一次显式重试，并取代此前失败的旧快照。
      stitchWriteFailedRef.current = false;
      setStitchSaveError(false);
      void drainStitchWrites();
    },
    [drainStitchWrites],
  );

  const retryStitchSave = useCallback((): void => {
    void drainStitchWrites(true);
  }, [drainStitchWrites]);

  /** 离开沉浸区、页面隐藏和卸载前都尽力启动最后一次写入。 */
  useEffect(() => {
    const flush = (): void => {
      void drainStitchWrites(true);
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
  }, [drainStitchWrites]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    [],
  );

  // beforeunload 防丢失
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => {
      void drainStitchWrites(true);
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = t.confirmLeave;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [drainStitchWrites, t.confirmLeave]);

  // 保存状态接缝（T17）
  useEffect(() => {
    onSavedStatus?.(saveState);
  }, [saveState, onSavedStatus]);

  // 上传步骤时应用配置默认参数（站点配置加载完成后/每次回到上传步骤都同步）。
  // 只更新参数：用户可能已在空白起稿区选好了色板/制作规格，异步配置响应不得覆盖该选择。
  useEffect(() => {
    if (step !== "upload" || rebindRestoredSourceRef.current) return;
    if (
      generationDraft.params.targetWidth === defaultParams.targetWidth &&
      generationDraft.params.targetColorCount === defaultParams.targetColorCount
    )
      return;
    updateGenerationDraft({ ...generationDraft, params: defaultParams });
  }, [defaultParams, generationDraft, step, updateGenerationDraft]);

  // 新建设计默认色板（「我的 · 色板」设为默认）：读到后换进上传步骤的草稿；草稿已不是上一次套用的默认值（用户换过）就不动。
  const defaultPalette = useDefaultPalette();
  const appliedDefaultPaletteRef = useRef<string>(FALLBACK_DEFAULT_PALETTE);
  useEffect(() => {
    if (step !== "upload" || rebindRestoredSourceRef.current || !defaultPalette.ready) return;
    const current = generationDraft.paletteSelection.palette;
    if (current.kind !== "builtin" || current.brand !== appliedDefaultPaletteRef.current || current.brand === defaultPalette.value) return;
    appliedDefaultPaletteRef.current = defaultPalette.value;
    const palette: ProjectPalette = { kind: "builtin", brand: defaultPalette.value };
    updateGenerationDraft({
      ...generationDraft,
      boardProfile: defaultBoardProfileForPalette(palette, generationDraft.boardProfile),
      paletteSelection: { palette, kitTier: 0 },
    });
  }, [defaultPalette.ready, defaultPalette.value, generationDraft, step, updateGenerationDraft]);

  // 卸载时作废在途任务。调用方注入的图片解码器不在本组件中销毁。
  useEffect(() => {
    return () => {
      // 即使调用方拥有解码器，也清除当前工作台所绑定的原图源；不销毁注入实例。
      imageOperationRef.current += 1;
      imageBusyRef.current = false;
      encodedSourceRef.current = null;
      activeImageDecoder.clear();
      disposeGenerateWorker();
      if (!imageDecoder) ownedImageDecoder.dispose();
    };
  }, [activeImageDecoder, imageDecoder, ownedImageDecoder]);

  // ---------- 恢复最后设计 ----------

  useEffect(() => {
    // StrictMode 安全：不做 ref 一次性守卫——dev 双调用时第一次会被 cleanup 取消，
    // 第二次必须正常执行完恢复逻辑（此前 ref 守卫导致第二次直接跳过 → 打开设计后空白）。
    // 恢复本身只读 + setState，重复执行幂等。
    let cancelled = false;
    const restoreOperation = imageOperationRef.current;
    const restore = async (): Promise<void> => {
      try {
        const adapter = storage === undefined ? await openIndexedDb() : storage;
        if (cancelled) return;
        adapterRef.current = adapter;
        setStorageReady(Boolean(adapter));
        if (!adapter) {
          setSaveState("unavailable");
          return;
        }
        // 恢复策略（D66）：/app 无 id 是创作入口，不恢复任何历史设计（?new=1 同义，兼容旧链接）；
        // ?id=X 仅当本地存在该设计时恢复，不存在则留在入口并说明（绝不回落打开其他设计）。
        // 新设计进入编辑器时会把 id 写进地址，所以刷新仍回到同一份。
        const urlParams = new URLSearchParams(window.location.search);
        const requestedId = urlParams.get("id");
        const records = await adapter.getAll();
        if (cancelled || imageOperationRef.current !== restoreOperation) return;
        setSavedNames(records.map((r) => r.name));
        if (!requestedId) {
          // 深链 /app?blank=1（「我的」空状态「从空白开始」）：直接打开空白画布弹窗，参数用过即去掉。
          if (urlParams.get("blank") === "1") {
            setBlankOpen(true);
            urlParams.delete("blank");
            const rest = urlParams.toString();
            window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
          }
          return;
        }
        const last = records.find((r) => r.id === requestedId);
        if (!last) {
          setErrorMsg(t.designNotLocal);
          return;
        }
        const project = parseStoredProject(last.projectJson);
        if (!project) {
          setErrorMsg(t.designUnreadable);
          return;
        }
        // The derivative source is optional. A failed source read must not
        // make a complete design inaccessible or authorize clearing that source.
        const localSource = await adapter
          .getGenerationSource(last.id)
          .catch(() => null);
        if (cancelled || imageOperationRef.current !== restoreOperation) return;
        setActiveDesignId(last.id);
        setSavedNames(records.map((r) => r.name));
        loadCommittedProject(project, localSource);
        // D49：豆社引用刚交接过来的作者原图 → 绑定到这份副本（不重新生成）。
        const handedOriginal: PendingOriginal | null =
          await takePendingOriginal(last.id).catch(() => null);
        if (cancelled) return;
        if (handedOriginal) {
          await bindOriginalToDesign(
            {
              bytes: new Uint8Array(handedOriginal.bytes),
              type: handedOriginal.type,
              name: handedOriginal.name,
            },
            project,
          );
          if (cancelled) return;
        }
        const requestedPalette = urlParams.get("palette");
        if (requestedId && requestedPalette && requestedPalette.length <= 200) {
          setPaletteIntent({ designId: requestedId, value: requestedPalette });
        }
        if (urlParams.get("publish") === "1") {
          const workId = urlParams.get("workId");
          setPublishWorkId(workId && /^[0-9a-f-]{36}$/i.test(workId) ? workId : null);
          setPublishRequested(true);
        }
        const requestedMode = urlParams.get("mode");
        if (
          requestedId &&
          (requestedMode === "edit" || requestedMode === "stitch")
        )
          setTab(requestedMode);
      } catch {
        adapterRef.current = null;
        setStorageReady(false);
        setSaveState("unavailable");
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [
    bindOriginalToDesign,
    loadCommittedProject,
    setActiveDesignId,
    storage,
    t.designNotLocal,
    t.designUnreadable,
  ]);

  // 豆社引用来源：设计切换时探测服务器是否仍保留原图（作者撤回 / 注销后即不可取回）。
  // 探测结果按设计 ID 记录，切换设计后旧结果自然失效，不需要在 effect 里同步清空。
  useEffect(() => {
    if (!communityOrigin || authStatus.kind !== "user") return;
    let cancelled = false;
    void (async () => {
      const revisionId = await lookupOriginalSource(designId);
      if (cancelled || !revisionId) return;
      const available = await canFetchRevisionOriginal(revisionId);
      if (!cancelled && available) setCommunitySource({ revisionId, designId });
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus.kind, communityOrigin, designId]);
  const communitySource =
    communitySourceProbe?.designId === designId && communityOrigin
      ? communitySourceProbe
      : null;

  const fetchCommunityOriginal = useCallback(async (): Promise<void> => {
    const project = buildProjectRef.current();
    if (!communitySource || !project) return;
    setErrorMsg(null);
    setBusy(true);
    setBusyText(t.fetchingCommunityOriginal);
    try {
      const original = await fetchRevisionOriginal(communitySource.revisionId);
      if (!original) {
        setCommunitySource(null);
        setErrorMsg(t.communityOriginalGone);
        return;
      }
      await bindOriginalToDesign(
        {
          bytes: original.bytes,
          type: original.type,
          name: `${communitySource.revisionId}.${original.type}`,
        },
        project,
      );
    } catch {
      setErrorMsg(t.communityOriginalFailed);
    } finally {
      setBusy(false);
    }
  }, [
    bindOriginalToDesign,
    communitySource,
    t.communityOriginalFailed,
    t.communityOriginalGone,
    t.fetchingCommunityOriginal,
  ]);

  // ---------- 导入 ----------

  const handleImport = useCallback(
    (project: ProjectFile): void => {
      rebindRestoredSourceRef.current = false;
      pendingGenerationSourceRef.current = undefined;
      cancelGeneration();
      disposeGenerateWorker();
      setShowProgress(false);
      clearOriginalSource();
      setActiveDesignId(newDesignId());
      setCommunityOrigin(false);
      setName(project.name);
      setCreatedAt(project.createdAt);
      const computed = computeStats(project.pattern.cells);
      const importedTotal = totalBeadCount(computed);
      setCustomPaletteId(null);
      const importedCommit = {
        boardProfile: project.boardProfile,
        params: project.params,
        paletteSelection: project.paletteSelection,
        pattern: project.pattern,
        stats: computed,
        total: importedTotal,
        engineVersion: project.engineVersion,
      };
      restoreGeneration(importedCommit);
      setErrorMsg(null);
      markDirty();
      setStep("workspace");
      showDesignQuery(designIdRef.current); // 导入即新设计：地址换成它自己的 id
    },
    [
      clearOriginalSource,
      cancelGeneration,
      markDirty,
      restoreGeneration,
      setActiveDesignId,
    ],
  );

  const resetWorkbench = useCallback((): void => {
    rebindRestoredSourceRef.current = false;
    pendingGenerationSourceRef.current = undefined;
    cancelGeneration();
    disposeGenerateWorker();
    setShowProgress(false);
    dirtyRef.current = false;
    setStep("upload");
    clearOriginalSource();
    setErrorMsg(null);
    setActiveDesignId(newDesignId());
    setName("");
    setCreatedAt("");
    setCommunityOrigin(false);
    setCustomPaletteId(null);
    uploadGenerationSource(null, initialGenerationDraft);
    clearDesignQuery();
  }, [
    clearOriginalSource,
    cancelGeneration,
    initialGenerationDraft,
    setActiveDesignId,
    uploadGenerationSource,
  ]);

  /** Flush dirty state before an in-app transition. Only a failed flush asks
   * the user whether to discard the unsaved work. */
  const saveBeforeLeave = useCallback(
    async (leave: () => void): Promise<void> => {
      await drainStitchWrites(true);
      if (!dirtyRef.current) {
        leave();
        return;
      }
      const saved = await doSave();
      if (saved && !dirtyRef.current) {
        leave();
        return;
      }
      if (
        await confirm({
          title: t.confirmLeaveTitle,
          message: t.confirmLeave,
          confirmLabel: t.confirmLeaveAction,
          danger: true,
        })
      )
        leave();
    },
    [
      confirm,
      doSave,
      drainStitchWrites,
      t.confirmLeave,
      t.confirmLeaveAction,
      t.confirmLeaveTitle,
    ],
  );

  /** 外壳里的站内跳转（顶栏、底栏、搜索）：离开前先保存。 */
  const leaveTo = useCallback(
    (href: string): void => {
      void saveBeforeLeave(() => router.push(href));
    },
    [router, saveBeforeLeave],
  );

  const handleNavigationClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string): void => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      void saveBeforeLeave(() => router.push(href));
    },
    [router, saveBeforeLeave],
  );

  // ---------- 编辑器（票 08 / 09）的界面接缝：业务仍是上面这些处理函数 ----------

  const sourceInputRef = useRef<HTMLInputElement>(null);
  /** 编辑器里「选择原图」：为这张图纸重新选原图（保留设计身份），之后走同一条解码 → 裁剪 → 重新生成。 */
  const handleSourceFile = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = validateImageFile({ bytes, name: file.name });
      if (!checked.ok) {
        setErrorMsg(zhCN.errors[checked.code]);
        return;
      }
      rebindRestoredSourceRef.current = Boolean(generationSession.committed);
      await handleUpload({ bytes, name: file.name, type: checked.type });
    },
    [generationSession.committed, handleUpload],
  );

  const exportProjectFile = useCallback((): void => {
    const committed = selectCommittedSnapshot(generationSession);
    if (!committed) return;
    const analyticsSource = communityOrigin ? "community" : "other";
    try {
      const fileName = name.trim() || zhCN.project.unnamed;
      const text = serializeProject({
        original,
        name: fileName,
        createdAt: createdAt || new Date().toISOString(),
        engineVersion: committed.engineVersion,
        boardProfile: committed.boardProfile,
        paletteSelection: committed.paletteSelection,
        params: committed.params,
        pattern: committed.pattern,
      });
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = projectFileName(fileName);
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
      }
      track({
        name: "design_exported",
        properties: { format: "project", source: analyticsSource },
      });
      toast(zhCN.editorWorkspace.exportMenu.exported);
    } catch {
      track({
        name: "export_failed",
        properties: { format: "project", errorCode: "PROJECT_EXPORT_FAILED" },
      });
      toast(zhCN.editorWorkspace.exportMenu.exportFailed);
    }
  }, [communityOrigin, createdAt, generationSession, name, original, toast]);

  /** 复制为新设计：先把当前改动落盘，再以新 id 另存一份（原图资产在新设计下重新关联），并切到副本。 */
  const duplicateDesign = useCallback(async (): Promise<void> => {
    const adapter = adapterRef.current;
    if (!adapter) {
      setSaveState("unavailable");
      return;
    }
    if (dirtyRef.current) await doSave();
    const project = buildProjectRef.current();
    if (!project) return;
    const records = await adapter.getAll().catch(() => []);
    const copyName = conflictName(
      zhCN.editorWorkspace.moreMenu.copyName(project.name),
      records.map((item) => item.name),
    );
    const now = new Date().toISOString();
    const copy: ProjectFile = {
      ...project,
      ...(project.original
        ? { original: { ...project.original, assetId: undefined } }
        : {}),
      name: copyName,
      createdAt: now,
      updatedAt: now,
    };
    const copySource =
      pendingGenerationSourceRef.current === undefined
        ? sourceRef.current
        : pendingGenerationSourceRef.current;
    const copyId = newDesignId();
    try {
      await withDesignStorageLock(() =>
        adapter.put(
          createDesignRecord(
            copyId,
            copy,
            renderThumbnail(
              copy.pattern,
              256,
              getBoardProfile(copy.boardProfile).boardCols,
            ),
          ),
          copySource
            ? replaceGenerationSource(createLocalGenerationSource(copySource))
            : CLEAR_GENERATION_SOURCE,
        ),
      );
    } catch (error) {
      setSaveState(isQuotaError(error) ? "quota" : "error");
      return;
    }
    pendingGenerationSourceRef.current = undefined;
    setActiveDesignId(copyId);
    setName(copyName);
    setCreatedAt(now);
    updateOriginal(copy.original);
    setSavedNames((prev) => [...prev, copyName]);
    showDesignQuery(copyId);
    markDirty();
    toast(zhCN.editorWorkspace.moreMenu.duplicated(copyName));
  }, [doSave, markDirty, setActiveDesignId, toast, updateOriginal]);

  /** 删除设计：与「我的设计」同一套规则——已上云的先做条件删除，只在本机的写墓碑，避免下次同步复活。 */
  const deleteDesign = useCallback(async (): Promise<boolean> => {
    const adapter = adapterRef.current;
    const id = designIdRef.current;
    const deletedName = name.trim() || zhCN.project.unnamed;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    dirtyRef.current = false;
    try {
      const api = createBeadhueApi();
      if (adapter) {
        const record = (await adapter.getAll()).find((item) => item.id === id);
        let cloudRevision = record?.revision ?? 0;
        const identity = await api.me().catch(() => ({ state: "guest" as const }));
        if (identity.state === "verified") {
          let cloud = await api.getDesign(id);
          if (!cloud && cloudRevision <= 0) {
            await enqueueDesignSync(adapter, api);
            cloud = await api.getDesign(id);
          }
          cloudRevision = cloud?.revision ?? 0;
        }
        if (cloudRevision > 0) {
          await api.deleteDesign(id, cloudRevision);
          await withDesignStorageLock(() => adapter.delete(id));
        } else if (record) {
          const client = createSyncClient(adapter, api);
          await withDesignStorageLock(() =>
            client.deleteLocal(id, new Date().toISOString(), record.revision ?? 0),
          );
        }
        await adapter.deleteStitchProgress(id).catch(() => undefined);
      }
      toast(zhCN.editorWorkspace.moreMenu.deleted(deletedName));
      router.push("/me");
      return true;
    } catch {
      toast(zhCN.editorWorkspace.moreMenu.deleteFailed);
      return false;
    }
  }, [name, router, toast]);

  /** 编辑器「…」里导入项目文件：与旧导出面板同一套校验（大小上限、格式、重名加后缀），成为新设计。 */
  const importProjectFromFile = useCallback(
    async (file: File): Promise<void> => {
      if (file.size > LIMITS.projectFileBytes) {
        setErrorMsg(zhCN.project.tooLarge);
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        setErrorMsg(zhCN.project.invalidFile);
        return;
      }
      const result = importProjectFile(text);
      if (!result.ok) {
        setErrorMsg(`${zhCN.project.importFailed}${result.errors.join('；')}`);
        return;
      }
      handleImport({
        ...result.project,
        name: conflictName(result.project.name, savedNames),
      });
    },
    [handleImport, savedNames],
  );

  const workspacePaletteChoices = useMemo<PaletteChoice[]>(() => {
    if (paletteChoices.some((choice) => choice.value === selectedPalette))
      return paletteChoices;
    // 导入项目自带的自定义色板（或已不在云端的我的色板）：列出来当作当前项，不能再切回。
    const colors =
      projectPalette.kind === "custom"
        ? projectPalette.colors.map((color) => ({
            code: color.code,
            hex: color.hex,
          }))
        : [];
    return [
      ...paletteChoices,
      {
        value: selectedPalette,
        name: zhCN.editorWorkspace.colors.customPalette,
        meta: `${zhCN.editorWorkspace.colors.customPaletteMeta(colors.length)} · ${paletteSizes(projectPalette)}`,
        band: colors.slice(0, 8).map((color) => color.hex),
        palette: projectPalette,
        colors,
      },
    ];
  }, [paletteChoices, projectPalette, selectedPalette]);
  const workspaceSpecChoices = useMemo(
    () => buildSpecChoices(projectPalette, paletteDisplayName),
    [paletteDisplayName, projectPalette],
  );
  const workspaceKitTiers = useMemo(
    () => KIT_TIERS.filter((tier) => tier === 0 || tier <= paletteColorCount),
    [paletteColorCount],
  );
  const originalStatus: ReferenceStatus = !original
    ? "none"
    : !original.geometry
      ? "missing"
      : originalImage
        ? "ready"
        : originalImageState?.sha256 === original.sha256 &&
            originalImageState.state === "missing"
          ? "missing"
          : "loading";
  const missingReason: MissingReason = communityOrigin
    ? "reuse"
    : original
      ? "local"
      : "blank";

  const forceDragging = useForcedDragging();
  const intentOption =
    paletteIntent &&
    paletteOptions.find(
      (option) =>
        option.value === paletteIntent.value &&
        (!option.value.startsWith("custom:") ||
          cloudPalettes.some((item) => `custom:${item.id}` === option.value)),
    );
  const dismissPaletteIntent = () => {
    setPaletteIntent(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("palette");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  const previousTabRef = useRef<Tab>(tab);
  useEffect(() => {
    if (previousTabRef.current === "stitch" && tab !== "stitch") {
      void drainStitchWrites(true);
    }
    previousTabRef.current = tab;
  }, [drainStitchWrites, tab]);

  // 选图入口（含首版生成的「新建图纸」弹窗）；有图纸之后是编辑器工作区（桌面 / 手机同一组件）。
  if (step === "upload" || !pattern) {
    const entryError = visibleErrorMsg ? (
      <>
        {visibleErrorMsg}
        {(visibleErrorMsg === t.designNotLocal ||
          visibleErrorMsg === t.designUnreadable) && (
          <>
            {" "}
            <Link
              className="text-accent underline"
              href="/me"
              onClick={(event) => handleNavigationClick(event, "/me")}
            >
              {t.backToDesigns}
            </Link>
          </>
        )}
      </>
    ) : (
      (syncNotice ??
      (saveState === "unavailable"
        ? t.unavailable
        : saveState === "quota"
          ? t.quotaError
          : null))
    );
    return (
      <SiteShell
        nav="create"
        topbarCta={false}
        onNavigate={leaveTo}
      >
        <CreateEntry
          onImage={(file) => void handleUpload(file)}
          onBlank={() => setBlankOpen(true)}
          onImport={handleImport}
          existingNames={savedNames}
          busy={busy || (step === "crop" && !pattern)}
          busyText={busy ? busyText : undefined}
          error={step === "upload" ? entryError : null}
          forceDragging={forceDragging}
          storage={storage}
          onNavigate={handleNavigationClick}
          reselect={
            pattern
              ? {
                  backLabel: t.cancelSelectOriginal,
                  onBack: () => {
                    restoreReplacement();
                    rebindRestoredSourceRef.current = false;
                    setStep("workspace");
                  },
                }
              : undefined
          }
        />
        {step === "crop" && decoded && !pattern && (
          <NewDrawingDialog
            image={decoded}
            params={params}
            paletteValue={selectedPalette}
            boardProfile={boardProfile}
            paletteChoices={paletteChoices}
            colorRange={{
              min: 2,
              max: Math.max(64, params.targetColorCount),
            }}
            working={busy || generating}
            progress={generating ? generationSession.progress : null}
            error={visibleErrorMsg}
            onGenerate={handleNewDrawing}
            onCancelGeneration={handleCancelGenerate}
            onClose={handleCropCancel}
          />
        )}
        {blankOpen && !pattern && (
          <BlankCanvasDialog
            paletteChoices={paletteChoices}
            paletteValue={selectedPalette.startsWith("__") ? `builtin:${defaultPalette.value}` : selectedPalette}
            boardProfile={boardProfile}
            onCreate={handleBlankCreate}
            onClose={() => setBlankOpen(false)}
          />
        )}
        {confirmDialog}
      </SiteShell>
    );
  }
  const workspaceNotices: WorkspaceNotice[] = [];
  if (busy)
    workspaceNotices.push({ id: "busy", tone: "info", text: busyText });
  if (saveState === "unavailable")
    workspaceNotices.push({ id: "unavailable", tone: "warning", text: t.unavailable });
  if (saveState === "quota")
    workspaceNotices.push({ id: "quota", tone: "danger", text: t.quotaError });
  if (visibleErrorMsg && visibleErrorMsg !== dismissedError)
    workspaceNotices.push({
      id: "error",
      tone: "danger",
      text: visibleErrorMsg,
      onDismiss: () => setDismissedError(visibleErrorMsg),
    });
  if (syncNotice)
    workspaceNotices.push({
      id: "sync",
      tone: "info",
      text: syncNotice,
      onDismiss: () => setSyncNotice(null),
    });
  return (
    <>
      <EditorWorkspace
        designId={designId}
        name={name}
        onRename={(nextName) => {
          setName(nextName);
          markDirty();
        }}
        save={{
          state: saveState,
          cloud: cloudSaveState,
          loggedIn: authStatus.kind === "user",
          onRetry: () => void doSave(),
          onSaveNow: () => {
            if (!generating && generationSession.committed) void doSave();
          },
        }}
        mode={tab === "stitch" ? "stitch" : "edit"}
        onModeChange={setTab}
        stitchProgress={stitchProgress}
        onStitchChange={updateStitchProgress}
        pattern={pattern}
        stats={stats}
        total={total}
        onPatternChange={handlePatternChange}
        palette={palette}
        paletteColorCount={paletteColorCount}
        paletteChoices={workspacePaletteChoices}
        paletteValue={selectedPalette}
        paletteName={paletteDisplayName}
        onPaletteSelect={handlePaletteSelect}
        paletteLocked={generating || !generationSession.committed}
        paletteNotice={paletteLoadFailed ? zhCN.editorWorkspace.colors.paletteLoadFailed : null}
        specChoices={workspaceSpecChoices}
        spec={boardProfile}
        specLabel={boardSpec.displayName}
        boardSize={boardSpec.boardCols}
        onSpecSelect={handleBoardProfileSelect}
        kitTiers={workspaceKitTiers}
        kitTier={kitTier}
        onKitChange={handleKitTierChange}
        params={params}
        onRegenerate={handleParamsChange}
        hasSource={Boolean(source)}
        source={source}
        generating={generating}
        generationProgress={progress}
        generationRound={generationRound}
        onCancelGeneration={handleCancelGenerate}
        original={original}
        originalImage={originalImage}
        referenceStatus={originalStatus}
        missingReason={missingReason}
        onOriginalChange={updateOriginal}
        onChooseSource={() => sourceInputRef.current?.click()}
        onFetchCommunity={communitySource ? () => void fetchCommunityOriginal() : undefined}
        canRecrop={Boolean(decoded)}
        onRecrop={() => {
          if (decoded) startTransition(() => setStep("crop"));
        }}
        regenerationUndo={Boolean(generationSession.regenerationUndo)}
        onUndoRegeneration={handleUndoRegeneration}
        communityOrigin={communityOrigin}
        onExportProject={exportProjectFile}
        cellMm={boardProfile === DEFAULT_BOARD_PROFILE_ID ? undefined : boardSpec.pdfCellMm}
        prepareShare={prepareShare}
        getOriginal={() => retainedOriginalRef.current}
        onBack={() => void saveBeforeLeave(() => router.push("/me"))}
        onNewDesign={() => void saveBeforeLeave(resetWorkbench)}
        onDuplicate={() => void duplicateDesign()}
        onDelete={deleteDesign}
        onImportFile={(file) => void importProjectFromFile(file)}
        notices={
          stitchSaveError
            ? [
                ...workspaceNotices,
                {
                  id: "stitch-save",
                  tone: "danger",
                  text: t.stitchSaveFailed,
                  actions: [{ label: t.stitchSaveRetry, onClick: retryStitchSave }],
                },
              ]
            : workspaceNotices
        }
        paletteIntent={
          paletteIntent?.designId === designId
            ? {
                question: intentOption
                  ? t.paletteIntentQuestion(intentOption.brand, intentOption.series, name)
                  : t.paletteIntentMissing,
                help: t.paletteIntentHelp,
                applyLabel: t.paletteIntentApply,
                cancelLabel: t.paletteIntentCancel,
                applyDisabled: !intentOption || busy || generating || !generationSession.committed,
              }
            : null
        }
        onPaletteIntentApply={() => {
          if (!paletteIntent || paletteIntent.designId !== designId || !intentOption) return;
          handlePaletteSelect(paletteIntent.value);
          dismissPaletteIntent();
        }}
        onPaletteIntentCancel={dismissPaletteIntent}
        busy={busy}
        announcement={
          doneToken > 0 && !generating
            ? t.generateDone(pattern.width, pattern.height, total, stats.length)
            : ""
        }
        publishRequested={publishRequested}
        publishWorkId={publishWorkId}
        onPublishRequestHandled={() => {
          setPublishRequested(false);
          const url = new URL(window.location.href);
          url.searchParams.delete("publish");
          url.searchParams.delete("workId");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
        }}
      />
      <input
        ref={sourceInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        aria-label={zhCN.editorWorkspace.reference.fileLabel}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleSourceFile(file);
        }}
      />
      {step === "crop" && decoded && (
        <RecropDialog
          image={decoded}
          initialRect={lastCropRect}
          width={params.targetWidth}
          boardSize={boardSpec.boardCols}
          busy={busy}
          error={visibleErrorMsg}
          onConfirm={(rect) => void handleCropConfirm(rect)}
          onCancel={handleCropCancel}
        >
          {confirmDialog}
        </RecropDialog>
      )}
      {step === "crop" && decoded ? null : confirmDialog}
    </>
  );
}
