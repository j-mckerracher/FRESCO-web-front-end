import React, { useEffect, useState } from "react";

type ProgressState =
  | { kind: "bytes"; name: string; received: number; total: number }
  | { kind: "files"; current: number; total: number; failed?: number };

interface SWProgressMessage {
  type: "PROGRESS";
  name: string;
  received: number;
  total: number;
}

const DownloadProgress: React.FC = () => {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [failed, setFailed] = useState<number>(0);

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
      const detail = (event as CustomEvent<{ current: number; total: number; failed?: number }>).detail;
      setProgress({ kind: "files", current: detail.current, total: detail.total });
      if (detail.failed !== undefined) {
        setFailed(detail.failed);
      }
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
    if (failed > 0) {
      label += ` (${failed} failed)`;
    }
  }

  const isComplete = progress.kind === "files" && progress.current === progress.total;

  return (
    <div className="mt-4">
      <p className={failed > 0 ? "text-yellow-400" : ""}>{label}</p>
      <div className="w-full bg-gray-200 h-2 rounded">
        <div
          className={`h-2 rounded transition-all duration-300 ${
            failed > 0 ? "bg-yellow-500" : isComplete ? "bg-green-500" : "bg-purdue-boilermakerGold"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {failed > 0 && (
        <p className="text-yellow-400 text-sm mt-2">
          ⚠️ {failed} files failed to download. Check console for details.
        </p>
      )}
      {isComplete && failed === 0 && (
        <p className="text-green-400 text-sm mt-2">
          ✅ All downloads completed successfully!
        </p>
      )}
    </div>
  );
};

export default DownloadProgress;
