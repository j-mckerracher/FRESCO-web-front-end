import React, { useEffect, useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
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
      <main className="flex-1 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-purdue-boilermakerGold mb-4">
              Bulk Download
            </h1>
            <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
              <p className="text-white text-lg mb-4">
                Select an archive and choose a time window to download data.
              </p>
              <p className="text-gray-300 text-sm">
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
            <div className="text-center p-6 bg-gray-900 rounded-lg border border-gray-700">
              <p className="text-red-500 text-xl mb-4">{error}</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleRetry}
                  className="px-6 py-3 bg-purdue-boilermakerGold text-black rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Archive Selection</h2>
                <ArchiveSelector archives={archives} />
              </div>
              <div className="bg-gray-900 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Download Progress</h2>
                <DownloadProgress />
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BulkDownloadPage;
