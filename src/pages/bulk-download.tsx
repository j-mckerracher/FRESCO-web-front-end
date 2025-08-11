import React, { useEffect, useState } from "react";
import Header from "../components/Header";
import ArchiveSelector from "../components/ArchiveSelector";
import DownloadProgress from "../components/DownloadProgress";
import { fetchArchives, ArchiveMetadata } from "../util/archive-client";

const BulkDownloadPage: React.FC = () => {
  const [archives, setArchives] = useState<ArchiveMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadArchives = async () => {
      try {
        setLoading(true);
        setError(null);
        const archivesData = await fetchArchives();
        setArchives(archivesData);
      } catch (err) {
        console.error('Error fetching archives:', err);
        setError(err instanceof Error ? err.message : 'Failed to load archives');
      } finally {
        setLoading(false);
      }
    };

    loadArchives();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(console.error);
    }
  }, []);

  const handleRetry = () => {
    const loadArchives = async () => {
      try {
        setLoading(true);
        setError(null);
        const archivesData = await fetchArchives();
        setArchives(archivesData);
      } catch (err) {
        console.error('Error fetching archives:', err);
        setError(err instanceof Error ? err.message : 'Failed to load archives');
      } finally {
        setLoading(false);
      }
    };

    loadArchives();
  };

  return (
    <div className="bg-black min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-purdue-boilermakerGold mb-4">
              Bulk Download
            </h1>
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <p className="text-white text-lg mb-4">
                Select an archive and choose a time window to download data.
              </p>
              <p className="text-zinc-300 text-sm">
                Pre-packaged data archives are available for download. Each archive contains 
                curated datasets with verified checksums for integrity validation.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-center p-8">
              <div className="w-12 h-12 rounded-full bg-purdue-boilermakerGold animate-ping mx-auto mb-4" />
              <p className="text-xl text-white">Loading archives...</p>
            </div>
          ) : error ? (
            <div className="text-center p-6 bg-zinc-900 rounded-lg border border-zinc-800">
              <p className="text-red-500 text-xl mb-4">{error}</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-purdue-boilermakerGold text-black rounded-md hover:bg-purdue-rush transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <ArchiveSelector archives={archives} />
              <DownloadProgress />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkDownloadPage;
