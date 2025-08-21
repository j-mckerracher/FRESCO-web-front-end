import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/functions/oidc";

// ---- Config (env-backed) ----
const REGION = process.env.AWS_REGION || "us-east-1";
const ROLE_ARN = process.env.AWS_ROLE_ARN; // required for OIDC
const BUCKET_NAME = process.env.S3_BUCKET_NAME || "fresco-archive-data";

// Fail fast if OIDC role not configured
if (!ROLE_ARN) {
  throw new Error(
      "Missing AWS_ROLE_ARN. Configure an IAM role trusted by Vercel OIDC and set AWS_ROLE_ARN in Project → Settings → Environment Variables."
  );
}

// Build S3 client with short-lived creds from Vercel OIDC
const s3Client = new S3Client({
  region: REGION,
  credentials: awsCredentialsProvider({ roleArn: ROLE_ARN }),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name, start, end } = req.query;

  // Validate input
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Archive name is required" });
  }
  // Basic guard against traversal / weird keys
  if (name.includes("..")) {
    return res.status(400).json({ error: "Invalid archive name" });
  }

  // Optional debug logging
  if (start || end) {
    console.log(`Time range download requested: ${name}, start: ${start}, end: ${end}`);
  }

  try {
    // Create a presigned GET URL (1 hour)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: name,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Redirect to S3
    res.redirect(302, presignedUrl);
  } catch (error: any) {
    console.error(`Error generating presigned URL for ${name}:`, {
      message: error?.message,
      name: error?.name,
      code: error?.$metadata?.httpStatusCode,
      requestId: error?.$metadata?.requestId,
    });

    if (error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Archive not found" });
    }

    return res.status(500).json({ error: "Failed to generate download URL" });
  }
}
