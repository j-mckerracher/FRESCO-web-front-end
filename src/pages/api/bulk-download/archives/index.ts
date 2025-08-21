import type { NextApiRequest, NextApiResponse } from "next";
import { ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import { getEnv } from "@/lib/env";
import { ArchiveMetadata } from "../../../../util/archive-client";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ArchiveMetadata[] | { error: string }>
) {
  const { bucket } = getEnv();
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (!list.Contents) return res.status(200).json([]);

    const archives: ArchiveMetadata[] = [];
    for (const object of list.Contents) {
      if (object.Key && object.Key.endsWith(".zip")) {
        const head = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: object.Key })
        );
        archives.push({
          name: object.Key,
          size: object.Size || 0,
          checksum: head.ETag?.replace(/"/g, "") || "",
        });
      }
    }
    archives.sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json(archives);
  } catch (error: any) {
    console.error("Error listing archives:", {
      message: error?.message,
      name: error?.name,
      requestId: error?.$metadata?.requestId,
    });
    res.status(500).json({ error: "Failed to fetch archives" });
  }
}
