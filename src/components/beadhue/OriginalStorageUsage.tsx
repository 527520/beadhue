"use client";
import { zhCN } from "@/messages/zh-CN";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/legacy-ui/Icon";
export default function OriginalStorageUsage({
  account = false,
}: {
  account?: boolean;
}) {
  const [usage, setUsage] = useState<{
    bytes: number;
    quotaBytes: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/originals/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className={account ? "storage-card account-storage" : "storage-card"}>
      <div>
        <strong>
          <Icon name="cloud" size={18} /> {zhCN.beadhue.originalStorage}
        </strong>
        <p>{zhCN.beadhue.crossDeviceHint}</p>
      </div>
      <div>
        {usage ? (
          <>
            <p className="mono">
              {(usage.bytes / 1024 ** 2).toFixed(1)} MB /{" "}
              {(usage.quotaBytes / 1024 ** 3).toFixed(0)} GB
            </p>
            <div className="meter">
              <i
                style={{
                  width: `${Math.min(100, (usage.bytes / usage.quotaBytes) * 100)}%`,
                }}
              />
            </div>
          </>
        ) : (
          <p>{zhCN.beadhue.originalLoginHint}</p>
        )}
      </div>
      {!account && (
        <Link href="/account" className="button small quiet">
          {zhCN.beadhue.manageStorage}
          <Icon name="arrow" size={14} />
        </Link>
      )}
    </div>
  );
}
