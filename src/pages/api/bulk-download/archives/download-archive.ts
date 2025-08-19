import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = "fresco-archive-data";

// Initialize S3 client with explicit credentials
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name, start, end } = req.query;
  
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Archive name is required' });
  }

  // Log time range parameters for debugging (optional)
  if (start || end) {
    console.log(`Time range download requested: ${name}, start: ${start}, end: ${end}`);
  }

  // Check for required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'AWS credentials not configured' });
  }

  try {
    // Generate a presigned URL for downloading the archive
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: name,
    });

    // Generate presigned URL valid for 1 hour
    const presignedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600 
    });

    // Redirect to the presigned URL
    res.redirect(302, presignedUrl);
  } catch (error) {
    console.error(`Error generating presigned URL for ${name}:`, error);
    
    // Check if it's a NoSuchKey error (file not found)
    if (error instanceof Error && error.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'Archive not found' });
    }
    
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
}
