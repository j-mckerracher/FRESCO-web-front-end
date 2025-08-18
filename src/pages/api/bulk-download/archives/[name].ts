import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = "fresco-archive-data";

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name } = req.query;
  
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Archive name is required' });
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
