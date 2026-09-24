"use client";
import { zhCN } from "@/messages/zh-CN";

import { useAuthStatus } from "@/components/account/useAuthStatus";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  cancelOriginalTask,
  originalTasks,
  retryOriginalTask,
  resumeOriginalUploads,
  ORIGINAL_STATUS_EVENT,
  type OriginalTask,
} from "@/lib/originals/client";
export default function OriginalUploadStatus({
  designId,
  sha256,
  revisionId,
  problemsOnly = false,
}: {
  designId?: string;
  sha256?: string;
  revisionId?: string;
  problemsOnly?: boolean;
}) {
  const auth = useAuthStatus();
  const email = auth.kind === "user" ? auth.email : null;
  const [tasks, setTasks] = useState<OriginalTask[]>([]);
  useEffect(() => {
    const refresh = () => {
      void originalTasks()
        .then((t) =>
          setTasks(
            t.filter(
              (x) =>
                x.email === email &&
                (designId ? x.designId === designId : !x.designId) &&
                (!sha256 || x.sha256 === sha256) &&
                (!revisionId || x.url.includes(revisionId)),
            ),
          ),
        )
        .catch(() => undefined);
    };
    refresh();
    void resumeOriginalUploads();
    window.addEventListener(ORIGINAL_STATUS_EVENT, refresh);
    window.addEventListener("online", resumeOriginalUploads);
    return () => {
      window.removeEventListener(ORIGINAL_STATUS_EVENT, refresh);
      window.removeEventListener("online", resumeOriginalUploads);
    };
  }, [designId, sha256, revisionId, email]);
  const visible = tasks.filter(
    (t) => t.status !== "cancelled" && (designId || t.status !== "done"),
  );
  const task =
    visible.find((t) => t.status === "waiting" || t.status === "failed") ??
    visible.at(-1);
  if (!task || (problemsOnly && !["waiting", "failed"].includes(task.status)))
    return null;
  const waiting = task.status === "waiting";
  return (
    <div
      data-status={waiting ? "limited" : task.status}
      role="status"
      className={cn(
        "grid justify-items-start gap-1 rounded-md px-3 py-2.5 text-body-sm",
        waiting ? "bg-warning-soft text-warning" : task.status === "failed" ? "bg-danger-soft text-danger" : "bg-bg-subtle text-ink-2",
      )}
    >
      <strong className="font-semibold">
        {zhCN.beadhue.original}
        {task.status === "done"
          ? zhCN.beadhue.synced
          : task.status === "uploading"
            ? zhCN.beadhue.uploading
            : waiting
              ? zhCN.beadhue.uploadWaiting
              : task.status === "failed"
                ? zhCN.beadhue.uploadFailed
                : zhCN.beadhue.syncWaiting}
      </strong>
      {waiting ? (
        <p className="text-caption font-normal">
          {zhCN.beadhue.retryPrefix}
          {new Date(task.retryAt!).toLocaleTimeString("zh-CN")}{" "}
          {zhCN.beadhue.retry}
        </p>
      ) : task.message ? (
        <p className="text-caption font-normal">{task.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {task.status === "failed" && (
          <Button size="sm" onClick={() => void retryOriginalTask(task.key)}>
            {zhCN.beadhue.retryOriginal}
          </Button>
        )}
        {["pending", "waiting", "failed"].includes(task.status) && (
          <Button size="sm" variant="ghost" onClick={() => void cancelOriginalTask(task.key)}>
            {zhCN.beadhue.cancelUpload}
          </Button>
        )}
      </div>
    </div>
  );
}
