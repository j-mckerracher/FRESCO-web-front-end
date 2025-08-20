
export interface ArchiveMetadata {
  name: string;
  size: number;
  checksum: string;
}

export async function fetchArchives(): Promise<ArchiveMetadata[]> {
  console.log('🔍 BULK DOWNLOAD DEBUG: Fetching archives from API...');
  
  const res = await fetch("/api/bulk-download/archives");
  
  console.log('🔍 BULK DOWNLOAD DEBUG: Response status:', res.status);
  console.log('🔍 BULK DOWNLOAD DEBUG: Response headers:', Object.fromEntries(res.headers.entries()));
  
  if (!res.ok) {
    console.error('🚨 BULK DOWNLOAD ERROR: API request failed');
    console.error('🚨 Response status:', res.status);
    console.error('🚨 Response statusText:', res.statusText);
    
    try {
      const errorText = await res.text();
      console.error('🚨 Raw response body:', errorText);
      
      // Try to parse as JSON
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
        console.error('🚨 Parsed error data:', errorData);
      } catch (parseErr) {
        console.error('🚨 Could not parse response as JSON');
      }
      
      if (res.status === 500) {
        throw new Error(errorData.error || errorText || "Service temporarily unavailable");
      }
      throw new Error(`Failed to fetch archives (${res.status}): ${errorText}`);
    } catch (textErr) {
      console.error('🚨 Could not read response text:', textErr);
      throw new Error(`Failed to fetch archives (${res.status})`);
    }
  }
  
  console.log('✅ BULK DOWNLOAD DEBUG: API request successful');
  const data = await res.json();
  console.log('✅ BULK DOWNLOAD DEBUG: Received', data.length, 'archives');
  return data;
}

/**
 * Generate download URL for an archive
 * 
 * @param archiveName - Name of the archive to download
 * @returns Download URL for the archive
 */
export function getArchiveDownloadUrl(archiveName: string): string {
  return `/api/bulk-download/archives/download-archive?name=${encodeURIComponent(archiveName)}`;
}

/**
 * Utility functions for downloading archives and verifying their integrity.
 */

export interface DownloadResult {
    /** Blob representing the downloaded file */
    blob: Blob;
    /** Hex-encoded SHA-256 checksum of the downloaded data */
    checksum: string;
    /** Whether the checksum matched the expected value */
    verified: boolean;
}

/**
 * Compute the SHA-256 checksum for the given data using the Web Crypto API.
 *
 * @param data - ArrayBuffer containing the file data
 * @returns Hex-encoded checksum string
 */
export async function computeSHA256(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Download a file, compute its checksum and verify against the expected value.
 *
 * @param url - URL to download from
 * @param expectedChecksum - Expected SHA-256 checksum (hex string)
 * @param onProgress - Optional progress callback (0-100)
 * @returns Object containing the downloaded blob, computed checksum and verification status
 */
export async function downloadArchive(
    url: string,
    expectedChecksum: string,
    onProgress?: (progress: number) => void
): Promise<DownloadResult> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download archive: ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    if (reader) {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                received += value.length;
                if (onProgress && contentLength) {
                    const progress = Math.round((received / contentLength) * 100);
                    onProgress(progress);
                }
            }
        }
    }

    const blob = new Blob(chunks);
    const buffer = await blob.arrayBuffer();
    const checksum = await computeSHA256(buffer);
    const verified = checksum.toLowerCase() === expectedChecksum.toLowerCase();

    if (onProgress) {
        onProgress(100);
    }

    return { blob, checksum, verified };
}
