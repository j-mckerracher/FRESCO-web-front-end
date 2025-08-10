import React, { useEffect, useState } from "react";

interface ProgressState {
  name: string;
  received: number;
  total: number;
}

const DownloadProgress: React.FC = () => {
  const [progress, setProgress] = useState<ProgressState | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const handler = (event: MessageEvent) => {
        const data = event.data as any;
        if (data.type === "PROGRESS") {
          setProgress({ name: data.name, received: data.received, total: data.total });
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, []);

  if (!progress) return null;
  const pct = (progress.received / progress.total) * 100;

  return (
    <div className="mt-4">
      <p>
        {progress.name}: {pct.toFixed(1)}%
      </p>
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
