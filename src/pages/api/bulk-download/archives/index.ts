import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";

// In-memory demo archives
const ARCHIVES: Record<string, Buffer> = {
  "dataset-a.zip": Buffer.from("Demo content for dataset A"),
  "dataset-b.zip": Buffer.from("Demo content for dataset B"),
};

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const archives = Object.entries(ARCHIVES).map(([name, data]) => ({
    name,
    size: data.length,
    checksum: createHash("sha256").update(data).digest("hex"),
  }));
  res.status(200).json(archives);
}
