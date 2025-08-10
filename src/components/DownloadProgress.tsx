import React, { useEffect, useState } from 'react';
import { downloadArchive } from '@/util/archive-client';

interface DownloadProgressProps {
    /** URL to download from */
    url: string;
    /** Expected SHA-256 checksum returned by the API */
    checksum: string;
}

/**
 * Component that displays download progress and verification status.
 */
const DownloadProgress: React.FC<DownloadProgressProps> = ({ url, checksum }) => {
    const [progress, setProgress] = useState(0);
    const [verified, setVerified] = useState<boolean | null>(null);

    useEffect(() => {
        let mounted = true;
        const run = async () => {
            try {
                const result = await downloadArchive(url, checksum, setProgress);
                if (mounted) {
                    setVerified(result.verified);
                }
            } catch (err) {
                console.error('Download failed', err);
                if (mounted) {
                    setVerified(false);
                }
            }
        };
        run();
        return () => {
            mounted = false;
        };
    }, [url, checksum]);

    return (
        <div className="w-full max-w-md p-4">
            <div className="h-2 bg-gray-200 rounded">
                <div
                    className="h-2 bg-purdue-boilermakerGold rounded"
                    style={{ width: `${progress}%` }}
                />
            </div>
            {verified !== null && (
                <p
                    className={`mt-2 text-sm ${
                        verified ? 'text-green-600' : 'text-red-600'
                    }`}
                >
                    {verified ? 'Download verified' : 'Checksum mismatch'}
                </p>
            )}
        </div>
    );
};

export default DownloadProgress;
