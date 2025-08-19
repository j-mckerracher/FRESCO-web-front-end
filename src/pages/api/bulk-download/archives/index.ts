import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { ArchiveMetadata } from "../../../../util/archive-client";

const BUCKET_NAME = "fresco-archive-data";

// Initialize S3 client with explicit credentials
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ArchiveMetadata[] | { error: string }>
) {
  // Check for required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'AWS credentials not configured' });
  }

  try {
    // List all objects in the fresco-archive-data bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
    });

    const response = await s3Client.send(listCommand);

    if (!response.Contents) {
      return res.status(200).json([]);
    }

    // Get metadata for each archive
    const archives: ArchiveMetadata[] = [];
    
    for (const object of response.Contents) {
      if (object.Key && object.Key.endsWith('.zip')) {
        // Get detailed object metadata including ETag for checksum
        const headCommand = new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: object.Key,
        });
        
        const headResponse = await s3Client.send(headCommand);
        
        archives.push({
          name: object.Key,
          size: object.Size || 0,
          // Use ETag as checksum (remove quotes)
          checksum: headResponse.ETag?.replace(/"/g, '') || '',
        });
      }
    }

    // Sort archives by name for consistent ordering
    archives.sort((a, b) => a.name.localeCompare(b.name));
    
    res.status(200).json(archives);
  } catch (error) {
    console.error('Error fetching archives from S3:', error);
    
    // Return more specific error information for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Unknown';
    
    res.status(500).json({ 
      error: 'Failed to fetch archives',
      details: errorMessage,
      errorType: errorName,
      timestamp: new Date().toISOString()
    });
  }
}
