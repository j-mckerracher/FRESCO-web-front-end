export interface ArchiveMetadata {
  name: string;
  size: number;
  checksum: string;
}

export async function fetchArchives(): Promise<ArchiveMetadata[]> {
  const res = await fetch("/bulk-download/archives");
  if (!res.ok) {
    throw new Error("Failed to fetch archives");
  }
  return res.json();
}
