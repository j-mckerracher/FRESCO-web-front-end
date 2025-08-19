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

  type SWMessage =
    | { type: "PROGRESS"; name: string; received: number }
    | { type: "DOWNLOAD_READY"; name: string; url: string; isBlob?: boolean }
    | { type: "ERROR"; name: string; error: string };

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const handler = (event: MessageEvent<SWMessage>) => {
        const data = event.data;
        if (data.type === "PROGRESS" && selected && data.name === selected.name) {
          setOffset(data.received);
        } else if (data.type === "DOWNLOAD_READY" && selected && data.name === selected.name) {
          // Trigger browser download
          const link = document.createElement('a');
          link.href = data.url;
          link.download = data.name;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Clean up blob URL if it was created
          if (data.isBlob) {
            setTimeout(() => URL.revokeObjectURL(data.url), 1000);
          }
        } else if (data.type === "ERROR" && selected && data.name === selected.name) {
          console.error("Download error:", data.error);
          alert(`Download failed: ${data.error}`);
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

  const downloadDirect = () => {
    if (!selected) return;
    // Create direct download link to our API endpoint which redirects to S3
    const downloadUrl = `/api/bulk-download/archives/download-archive?name=${encodeURIComponent(selected.name)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = selected.name;
    link.target = '_blank'; // Open in new tab to handle redirects properly
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-2">
      <select
        className="border border-gray-600 bg-gray-800 text-white p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-purdue-boilermakerGold"
        value={selected?.name || ""}
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
      
      {/* Time Range Inputs */}
      <div className="flex flex-col gap-3 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col">
            <span className="text-sm text-gray-300 mb-1">Start Time</span>
            <input
              type="datetime-local"
              className="border border-gray-600 bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purdue-boilermakerGold"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm text-gray-300 mb-1">End Time</span>
            <input
              type="datetime-local"
              className="border border-gray-600 bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purdue-boilermakerGold"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={downloadDirect}
            disabled={!selected}
            className="bg-purdue-boilermakerGold px-6 py-3 rounded-lg text-black font-semibold hover:bg-yellow-500 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Download Full Archive
          </button>
          <button
            onClick={() => post("DOWNLOAD")}
            disabled={!selected || !start || !end}
            className="bg-blue-500 px-6 py-3 rounded-lg text-white font-semibold hover:bg-blue-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Download Time Range
          </button>
          <button
            onClick={() => post("ABORT")}
            disabled={!selected}
            className="bg-gray-500 px-6 py-3 rounded-lg text-white font-semibold hover:bg-gray-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Pause
          </button>
          <button
            onClick={() => post("DOWNLOAD")}
            disabled={!selected}
            className="bg-green-500 px-6 py-3 rounded-lg text-white font-semibold hover:bg-green-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveSelector;
