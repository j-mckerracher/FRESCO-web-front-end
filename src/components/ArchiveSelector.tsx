import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import type { ArchiveMetadata } from "../util/archive-client";
import { getArchiveDownloadUrl } from "../util/archive-client";

interface Props {
  archives: ArchiveMetadata[];
}

const ArchiveSelector: React.FC<Props> = ({ archives }) => {
  const [selected, setSelected] = useState<ArchiveMetadata | null>(null);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);

  const downloadArchives = async (toDownload: ArchiveMetadata[]) => {
    const total = toDownload.length;
    if (total === 0) return;
    if (total > 1) {
      window.dispatchEvent(
        new CustomEvent("archive-progress", { detail: { current: 0, total } })
      );
    }

    let completed = 0;
    for (const archive of toDownload) {
      const url = getArchiveDownloadUrl(archive.name);
      // Trigger browser download without fetching to avoid CORS issues
      const link = document.createElement("a");
      link.href = url;
      link.download = archive.name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      completed += 1;
      if (total > 1) {
        window.dispatchEvent(
          new CustomEvent("archive-progress", {
            detail: { current: completed, total },
          })
        );
      }

      // Small delay to prevent the browser from blocking multiple downloads
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const downloadRange = async () => {
    if (!start || !end) return;

    const archiveMap = new Map(archives.map((a) => [a.name, a]));
    const toDownload: ArchiveMetadata[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const name = `${year}-${month}.zip`;
      const archive = archiveMap.get(name);
      if (archive) {
        toDownload.push(archive);
      }
      current.setMonth(current.getMonth() + 1);
    }

    if (toDownload.length === 0) {
      alert("No archives available in the selected range.");
      return;
    }

    await downloadArchives(toDownload);
  };

  const downloadFull = async () => {
    if (archives.length === 0) return;
    const confirmed = window.confirm(
      `Download all ${archives.length} files?`
    );
    if (!confirmed) return;
    await downloadArchives(archives);
  };

  return (
    <div className="flex flex-col gap-2">
      <select
        className="border border-gray-600 bg-gray-800 text-white p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-purdue-boilermakerGold"
        value={selected?.name || ""}
        onChange={(e) => {
          const a = archives.find((x) => x.name === e.target.value) || null;
          setSelected(a);
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
            <DatePicker
              selected={start}
              onChange={(date: Date | null) => setStart(date)}
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              dateFormat="MMMM d, yyyy h:mm aa"
              className="border border-gray-600 bg-gray-800 text-white p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-purdue-boilermakerGold"
              placeholderText="Select start date and time"
              wrapperClassName="w-full"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm text-gray-300 mb-1">End Time</span>
            <DatePicker
              selected={end}
              onChange={(date: Date | null) => setEnd(date)}
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              dateFormat="MMMM d, yyyy h:mm aa"
              className="border border-gray-600 bg-gray-800 text-white p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-purdue-boilermakerGold"
              placeholderText="Select end date and time"
              wrapperClassName="w-full"
              minDate={start}
            />
          </label>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={downloadFull}
            disabled={archives.length === 0}
            className="bg-purdue-boilermakerGold px-6 py-3 rounded-lg text-black font-semibold hover:bg-yellow-500 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Download Full Archive
          </button>
          <button
            onClick={downloadRange}
            disabled={!start || !end}
            className="bg-blue-500 px-6 py-3 rounded-lg text-white font-semibold hover:bg-blue-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Download Time Range
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveSelector;
