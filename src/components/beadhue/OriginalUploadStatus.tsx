"use client";
import { zhCN } from "@/messages/zh-CN";

import { useAuthStatus } from "@/components/account/useAuthStatus";
import { useEffect, useState } from "react";
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
      className="sync-box"
      data-status={waiting ? "limited" : task.status}
      role="status"
    >
      <strong>
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
        <p>
          {zhCN.beadhue.retryPrefix}
          {new Date(task.retryAt!).toLocaleTimeString("zh-CN")}{" "}
          {zhCN.beadhue.retry}
        </p>
      ) : task.message ? (
        <p>{task.message}</p>
      ) : null}
      {task.status === "failed" && (
        <button type="button" onClick={() => void retryOriginalTask(task.key)}>
          {zhCN.beadhue.retryOriginal}
        </button>
      )}
      {["pending", "waiting", "failed"].includes(task.status) && (
        <button type="button" onClick={() => void cancelOriginalTask(task.key)}>
          {zhCN.beadhue.cancelUpload}
        </button>
      )}
    </div>
  );
}
