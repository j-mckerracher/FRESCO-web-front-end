import React, { useEffect, useState } from "react";
import type { ArchiveMetadata } from "../util/archive-client";

interface Props {
  archives: ArchiveMetadata[];
}

const ArchiveSelector: React.FC<Props> = ({ archives }) => {
  const [selected, setSelected] = useState<ArchiveMetadata | null>(null);
  const [offset, setOffset] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

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
    if (!selected || !start || !end) return;
    navigator.serviceWorker.controller?.postMessage({
      type,
      archive: selected,
      offset,
      start,
      end,
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
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <label className="flex flex-col">
            <span className="text-sm">Start Time</span>
            <input
              type="datetime-local"
              className="border p-2"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm">End Time</span>
            <input
              type="datetime-local"
              className="border p-2"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
        <button
          onClick={() => post("DOWNLOAD")}
          disabled={!selected || !start || !end}
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
          disabled={!selected || !start || !end}
          className="bg-green-300 px-4 py-2 rounded"
        >
          Resume
        </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveSelector;
