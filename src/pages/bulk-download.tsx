import React, { useEffect, useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
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
    <div className="bg-black min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-purdue-boilermakerGold mb-8">Bulk Download</h1>
          <div className="bg-gray-900 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Archive Selection</h2>
            <ArchiveSelector archives={archives} />
          </div>
          <div className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Download Progress</h2>
            <DownloadProgress />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BulkDownloadPage;
