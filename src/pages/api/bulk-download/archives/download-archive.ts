import type { NextApiRequest, NextApiResponse } from "next";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";
import { getEnv } from "@/lib/env";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name } = req.query;
  const { bucket } = getEnv();

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Archive name is required" });
  }
  if (name.includes("..")) {
    return res.status(400).json({ error: "Invalid archive name" });
  }

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: name });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.redirect(302, url);
  } catch (error: any) {
    console.error(`Error generating presigned URL for ${name}:`, {
      message: error?.message,
      name: error?.name,
      requestId: error?.$metadata?.requestId,
    });
    if (error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Archive not found" });
    }
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
}
