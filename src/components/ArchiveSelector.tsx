import React, { useEffect, useState } from "react";
import type { ArchiveMetadata } from "../util/archive-client";

interface Props {
  archives: ArchiveMetadata[];
}

const ArchiveSelector: React.FC<Props> = ({ archives }) => {
  const [selected, setSelected] = useState<ArchiveMetadata | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const handler = (event: MessageEvent) => {
        const data = event.data as any;
        if (data.type === "PROGRESS" && selected && data.name === selected.name) {
          setOffset(data.received);
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, [selected]);

  const post = (type: string) => {
    if (!selected) return;
    navigator.serviceWorker.controller?.postMessage({
      type,
      archive: selected,
      offset,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <select
        className="border p-2"
        onChange={(e) => {
          const a = archives.find((x) => x.name === e.target.value) || null;
          setSelected(a);
          setOffset(0);
        }}
      >
        <option value="">Select archive</option>
        {archives.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name} ({(a.size / 1e6).toFixed(2)} MB)
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={() => post("DOWNLOAD")}
          disabled={!selected}
          className="bg-purdue-boilermakerGold px-4 py-2 rounded"
        >
          Start
        </button>
        <button
          onClick={() => post("ABORT")}
          disabled={!selected}
          className="bg-gray-300 px-4 py-2 rounded"
        >
          Pause
        </button>
        <button
          onClick={() => post("DOWNLOAD")}
          disabled={!selected}
          className="bg-green-300 px-4 py-2 rounded"
        >
          Resume
        </button>
      </div>
    </div>
  );
};

export default ArchiveSelector;
