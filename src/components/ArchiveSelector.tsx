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

    // Batch size to prevent browser from being overwhelmed
    const BATCH_SIZE = 3;
    const DOWNLOAD_DELAY = 1500; // Increased delay between downloads
    const BATCH_DELAY = 3000; // Delay between batches
    
    if (total > 1) {
      window.dispatchEvent(
        new CustomEvent("archive-progress", { detail: { current: 0, total } })
      );
    }

    let completed = 0;
    const failed: string[] = [];
    
    // Process downloads in batches
    for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
      const batch = toDownload.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(total / BATCH_SIZE);
      
      console.log(`🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} files)`);
      
      // Process each file in the current batch
      for (const archive of batch) {
        try {
          const url = getArchiveDownloadUrl(archive.name);
          
          // Create download link with better error handling
          const link = document.createElement("a");
          link.href = url;
          link.download = archive.name;
          link.style.display = "none";
          
          // Add event listeners to track download success/failure
          let downloadStarted = false;
          
          const handleClick = () => {
            downloadStarted = true;
          };
          
          link.addEventListener('click', handleClick);
          
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Give browser time to process the download
          await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_DELAY));
          
          if (downloadStarted) {
            completed += 1;
            console.log(`✅ Download initiated for ${archive.name} (${completed}/${total})`);
          } else {
            failed.push(archive.name);
            console.warn(`❌ Download failed to start for ${archive.name}`);
          }
          
          // Update progress
          if (total > 1) {
            window.dispatchEvent(
              new CustomEvent("archive-progress", {
                detail: { current: completed, total, failed: failed.length },
              })
            );
          }
          
        } catch (error) {
          failed.push(archive.name);
          console.error(`❌ Error downloading ${archive.name}:`, error);
        }
      }
      
      // Add delay between batches (except for the last batch)
      if (batchStart + BATCH_SIZE < total) {
        console.log(`⏳ Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    // Final status report
    console.log(`📊 Download Summary: ${completed}/${total} successful, ${failed.length} failed`);
    
    if (failed.length > 0) {
      console.warn(`❌ Failed downloads:`, failed);
      
      // Show user notification about failed downloads
      const retryMessage = failed.length < 10 ? 
        `Some downloads failed: ${failed.join(', ')}. Please check your Downloads folder and manually retry any missing files.` :
        `${failed.length} downloads failed. Please check your Downloads folder and manually retry missing files.`;
      
      setTimeout(() => {
        alert(retryMessage);
      }, 1000);
    } else {
      console.log(`✅ All ${total} downloads initiated successfully!`);
      
      // Show success notification
      setTimeout(() => {
        alert(`All ${total} files have been queued for download. Please check your Downloads folder.`);
      }, 1000);
    }
  };;

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
    
    const totalSize = archives.reduce((sum, archive) => sum + archive.size, 0);
    const totalSizeGB = (totalSize / 1e9).toFixed(2);
    
    const confirmed = window.confirm(
      `Download all ${archives.length} files (${totalSizeGB} GB total)?\n\n` +
      `This will download files in batches to ensure reliability. ` +
      `The process may take several minutes to complete. ` +
      `Please keep this browser tab open until all downloads finish.`
    );
    if (!confirmed) return;
    
    await downloadArchives(archives);
  };;

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
