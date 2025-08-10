import React, { useEffect, useState } from "react";
import ArchiveSelector from "../components/ArchiveSelector";
import DownloadProgress from "../components/DownloadProgress";
import { fetchArchives, ArchiveMetadata } from "../util/archive-client";

const BulkDownloadPage: React.FC = () => {
  const [archives, setArchives] = useState<ArchiveMetadata[]>([]);

  useEffect(() => {
    fetchArchives().then(setArchives).catch(console.error);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(console.error);
    }
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Bulk Download</h1>
      <ArchiveSelector archives={archives} />
      <DownloadProgress />
    </div>
  );
};

export default BulkDownloadPage;
