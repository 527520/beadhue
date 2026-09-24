'use client';

/**
 * 创作入口（原型 create.js，/app 无 id）：居中 880 单列——display 标题与说明、大落区、
 * 并列次入口「从空白画布开始」「导入项目文件」、「用示例试试」、「最近的设计」、隐私说明。
 * 只做文件级校验（大小 / 类型 / 动图）；解码、原图缓存与生成交给工作台。
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight, CircleAlert, FileUp, Grid3x3, ImagePlus, Lock, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/appInfo';
import { validateImageFile } from '@/lib/image/validation';
import { conflictName, importProjectFile } from '@/lib/project/parse';
import type { ImageType } from '@/lib/image/sniff';
import type { StorageAdapter } from '@/lib/storage';
import type { ProjectFile } from '@/lib/types';
import { track } from '@/lib/analytics/client';
import { fileSizeBucket } from '@/lib/analytics/buckets';
import { perfMark } from '@/lib/perf/mark';
import { zhCN } from '@/messages/zh-CN';
import { CreateRecent } from './create-recent';

export interface PickedImage {
  bytes: Uint8Array;
  name: string;
  type: ImageType;
}

export const SAMPLES = ['cat', 'rabbit', 'tulips', 'frog'] as const;
export type SampleId = (typeof SAMPLES)[number];

export interface CreateEntryProps {
  onImage: (image: PickedImage) => void;
  onBlank: () => void;
  onImport: (project: ProjectFile) => void;
  existingNames: readonly string[];
  busy?: boolean;
  /** 解码中的状态文字（正在解码 / 正在转换 HEIC）。 */
  busyText?: string;
  /** 落区内的错误（解码失败、像素过多、设计不在本机等）。 */
  error?: ReactNode;
  /** 已恢复的图纸重新选择原图：只保留落区与「返回原图纸」。 */
  reselect?: { backLabel: string; onBack: () => void };
  /** 原型 ?drag=1：强制显示拖入态（视觉对照用）。 */
  forceDragging?: boolean;
  storage?: Pick<StorageAdapter, 'getAll' | 'getStitchProgress'> | null;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

const looksLikeImage = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);

export function CreateEntry({ onImage, onBlank, onImport, existingNames, busy = false, busyText, error, reselect, forceDragging = false, storage, onNavigate }: CreateEntryProps) {
  const t = zhCN.create;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const shownError = fileError ?? error;
  const isDragging = dragging || forceDragging;
  const locked = busy || reading;

  const takeFile = async (file: File | undefined) => {
    if (!file || locked) return;
    setFileError(null);
    if (!looksLikeImage(file)) {
      setFileError(t.notImage(file.name));
      return;
    }
    setReading(true);
    try {
      perfMark('upload-read-start');
      const bytes = await readBytes(file);
      perfMark('upload-read-end');
      const result = validateImageFile({ bytes, name: file.name });
      perfMark('upload-validate-end');
      if (!result.ok) {
        setFileError(zhCN.errors[result.code]);
        return;
      }
      if (result.type !== 'gif') track({ name: 'upload_selected', properties: { mimeGroup: result.type, sizeBucket: fileSizeBucket(file.size) } });
      onImage({ bytes, name: file.name, type: result.type });
    } catch {
      setFileError(zhCN.errors.UNKNOWN);
    } finally {
      setReading(false);
    }
  };
  const takeFileRef = useRef(takeFile);
  useEffect(() => {
    takeFileRef.current = takeFile;
  });

  // 整个窗口都是落区：拖进页面任意位置即进入拖入态（原型 mount 里的 window 监听）。
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void takeFileRef.current(event.dataTransfer?.files[0]);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.json$/i.test(file.name) || file.size > LIMITS.projectFileBytes) {
      toast(file.size > LIMITS.projectFileBytes ? zhCN.project.tooLarge : t.importNotProject, { icon: <CircleAlert aria-hidden="true" /> });
      return;
    }
    const result = importProjectFile(await file.text().catch(() => ''));
    if (!result.ok) {
      toast(`${zhCN.project.importFailed}：${result.errors[0] ?? t.importNotProject}`, { icon: <CircleAlert aria-hidden="true" /> });
      return;
    }
    const project = { ...result.project, name: conflictName(result.project.name, existingNames) };
    toast(t.imported(project.name), { icon: <FileUp aria-hidden="true" /> });
    onImport(project);
  };

  const pickSample = (id: SampleId) => {
    if (locked) return;
    setFileError(null);
    void fetch(`/examples/${id}.png`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((bytes) => onImage({ bytes: new Uint8Array(bytes), type: 'png', name: t.samples[id] }))
      .catch(() => setFileError(t.sampleFailed));
  };

  const title = locked && busyText ? busyText : null;
  const altCard = 'flex min-w-0 items-center gap-4 rounded-lg bg-bg px-5 py-4 text-left text-ink-3 inset-ring-1 inset-ring-line transition-shadow duration-state hover:text-ink hover:inset-ring-ink-3 focus-visible:focus-ring';

  return (
    <div data-ui="" className="mx-auto grid w-full max-w-create gap-4 px-gutter pt-6 pb-16 md:gap-6 md:pt-12">
      <header>
        <h1 className="text-display">{reselect ? t.reselectTitle : t.title}</h1>
        <p className="mt-2 text-body text-ink-3">{reselect ? t.reselectSubtitle : t.subtitle}</p>
      </header>

      <section
        aria-label={t.dropLabel}
        onClick={(event) => {
          if (!locked && !(event.target as HTMLElement).closest('button, [role=alert]')) fileRef.current?.click();
        }}
        className={cn(
          'relative grid min-h-60 cursor-pointer place-items-center rounded-xl px-4 py-6 text-center transition-[box-shadow,background-color] duration-state md:min-h-80 md:px-6 md:py-10',
          isDragging ? 'bg-accent-soft pegboard-dots-active inset-ring-2 inset-ring-accent' : 'bg-bg pegboard-dots inset-ring-1 inset-ring-line hover:inset-ring-line-strong',
        )}
      >
        <div className={cn('grid justify-items-center gap-3 p-4 md:px-12 md:py-6', isDragging ? 'drop-halo-active' : 'drop-halo')}>
          <span className={cn('grid size-14 place-items-center rounded-full transition-colors duration-state [&>svg]:size-6', isDragging ? 'bg-bg text-accent' : 'bg-bg-muted text-ink')}>
            <ImagePlus aria-hidden="true" strokeWidth={1.75} />
          </span>
          <h2 className="text-title-2" aria-live="polite">
            {title ?? (isDragging ? t.dropActive : <><span className="pointer-coarse:hidden">{t.dropIdle}</span><span className="hidden pointer-coarse:inline">{t.dropTouch}</span></>)}
          </h2>
          <p className="text-body-sm text-balance text-ink-3">{t.formats}</p>
          <Button variant="primary" size="lg" className="mt-2" disabled={locked} onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden="true" strokeWidth={1.75} />
            {t.choose}
          </Button>
          {shownError ? (
            <p role="alert" className="flex max-w-110 items-start gap-1.5 text-left text-body-sm text-danger [&>svg]:mt-0.75 [&>svg]:size-4 [&>svg]:shrink-0">
              <CircleAlert aria-hidden="true" strokeWidth={1.75} />
              <span>{shownError}</span>
            </p>
          ) : null}
        </div>
        {/* 不加 capture：移动端带 capture 只能开摄像头、选不了相册。 */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          aria-label={zhCN.upload.inputLabel}
          disabled={locked}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            void takeFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </section>

      {reselect ? (
        <div>
          <Button variant="outline" onClick={reselect.onBack}>
            {reselect.backLabel}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <button type="button" className={altCard} onClick={onBlank} disabled={locked}>
              <span className="grid size-12 shrink-0 place-items-center rounded-md bg-bg-muted text-ink [&>svg]:size-5">
                <Grid3x3 aria-hidden="true" strokeWidth={1.75} />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-title-3 text-ink">{t.blankTitle}</span>
                <span className="text-body-sm text-ink-3">{t.blankText}</span>
              </span>
              <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4.5 shrink-0" />
            </button>
            <button type="button" className={altCard} onClick={() => importRef.current?.click()} disabled={locked}>
              <span className="grid size-12 shrink-0 place-items-center rounded-md bg-bg-muted text-ink [&>svg]:size-5">
                <FileUp aria-hidden="true" strokeWidth={1.75} />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-title-3 text-ink">{t.importTitle}</span>
                <span className="text-body-sm text-ink-3">{t.importText}</span>
              </span>
              <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4.5 shrink-0" />
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              aria-label={zhCN.project.importInputLabel}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>

          <section aria-labelledby="create-samples" className="mt-4 grid gap-4 md:mt-6">
            <div>
              <h2 id="create-samples" className="text-title-2">
                {t.samplesTitle}
              </h2>
              <p className="mt-1 text-body-sm text-ink-3">{t.samplesHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {SAMPLES.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={locked}
                  aria-label={t.sampleAria(t.samples[id])}
                  onClick={() => pickSample(id)}
                  className="group grid min-w-0 gap-2 text-left outline-none"
                >
                  <span className="block aspect-square overflow-hidden rounded-lg bg-bg-subtle group-focus-visible:focus-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/examples/${id}.png`} alt="" loading="lazy" className="size-full object-contain transition-transform duration-400 ease-standard group-hover:scale-104" />
                  </span>
                  <span className="text-body-sm font-semibold text-ink">{t.samples[id]}</span>
                </button>
              ))}
            </div>
          </section>

          <CreateRecent storage={storage} onNavigate={onNavigate} />
        </>
      )}

      <p className="mt-4 flex items-center gap-2 text-body-sm text-ink-3 [&>svg]:size-4 [&>svg]:shrink-0">
        <Lock aria-hidden="true" strokeWidth={1.75} />
        <span>{t.privacy}</span>
      </p>
    </div>
  );
}
