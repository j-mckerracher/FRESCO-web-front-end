import React, { useEffect, useState } from "react";

type ProgressState =
  | { kind: "bytes"; name: string; received: number; total: number }
  | { kind: "files"; current: number; total: number };

interface SWProgressMessage {
  type: "PROGRESS";
  name: string;
  received: number;
  total: number;
}

const DownloadProgress: React.FC = () => {
  const [progress, setProgress] = useState<ProgressState | null>(null);

  useEffect(() => {
    const swHandler = (event: MessageEvent) => {
      const data = event.data as SWProgressMessage;
      if (data.type === "PROGRESS") {
        setProgress({
          kind: "bytes",
          name: data.name,
          received: data.received,
          total: data.total,
        });
      }
    };

    const multiHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ current: number; total: number }>).detail;
      setProgress({ kind: "files", current: detail.current, total: detail.total });
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", swHandler);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("archive-progress", multiHandler as EventListener);
    }

    return () => {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", swHandler);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "archive-progress",
          multiHandler as EventListener
        );
      }
    };
  }, []);

  if (!progress) return null;

  let pct = 0;
  let label = "";
  if (progress.kind === "bytes") {
    pct = (progress.received / progress.total) * 100;
    label = `${progress.name}: ${pct.toFixed(1)}%`;
  } else {
    pct = (progress.current / progress.total) * 100;
    label = `Downloaded ${progress.current} / ${progress.total} files`;
  }

  return (
    <div className="mt-4">
      <p>{label}</p>
      <div className="w-full bg-gray-200 h-2">
        <div
          className="bg-purdue-boilermakerGold h-2"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default DownloadProgress;
