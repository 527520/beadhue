'use client';

/**
 * 工作台「公开到豆社」（D49）。
 *
 * 先保存并同步设计，再将已解码的完整原图放入一次性交接库，方便投稿页预览。
 * 私人原图由独立缓存和上传队列持久保存；投稿页优先复用已关联资产，
 * 没有可用原图时才要求重新选择，并由用户确认公开条款。
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImageType } from '@/lib/image/sniff';
import { putPendingOriginal } from '@/lib/storage/pendingOriginals';
import { zhCN } from '@/messages/zh-CN';
import Button from '@/components/legacy-ui/Button';
import Notice from '@/components/legacy-ui/Notice';

interface Props {
  designId: string;
  /** 保存并同步到云端；返回 false 表示失败，不跳转。 */
  onBeforePublish?: () => Promise<boolean>;
  /** 当前会话原图（可能为空）。 */
  getOriginal: () => { bytes: Uint8Array; type: ImageType; name: string } | null;
  disabled?: boolean;
  disabledReason?: string;
}

export default function PublishToCommunityButton({ designId, onBeforePublish, getOriginal, disabled, disabledReason }: Props) {
  const t = zhCN.publish;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback(async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      if (onBeforePublish && !(await onBeforePublish())) { setError(t.notSynced); return; }
      const original = getOriginal();
      if (original) {
        try {
          await putPendingOriginal({ designId, bytes: original.bytes.slice().buffer as ArrayBuffer, type: original.type, name: original.name });
        } catch {
          // 交接失败不影响已关联资产；缺失资产时由投稿页要求重新选择。
        }
      }
      router.push(`/community/submit?designId=${encodeURIComponent(designId)}`);
    } finally {
      setBusy(false);
    }
  }, [designId, getOriginal, onBeforePublish, router, t.notSynced]);

  return (
    <div className="publish-community">
      <Button variant="secondary" size="sm" icon="send" disabled={disabled || busy} loading={busy} title={disabled ? disabledReason : undefined} onClick={() => void publish()}>
        {busy ? t.preparing : t.button}
      </Button>
      {error && <Notice kind="danger" compact>{error}</Notice>}
    </div>
  );
}
