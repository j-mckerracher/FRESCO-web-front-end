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
  // Debug logging
  console.log('=== BULK DOWNLOAD API DEBUG ===');
  console.log('AWS_ACCESS_KEY_ID present:', !!process.env.AWS_ACCESS_KEY_ID);
  console.log('AWS_SECRET_ACCESS_KEY present:', !!process.env.AWS_SECRET_ACCESS_KEY);
  console.log('AWS_REGION:', process.env.AWS_REGION || 'not set (will use us-east-1)');
  console.log('BUCKET_NAME:', BUCKET_NAME);
  
  // Check for required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('AWS credentials not configured in environment variables');
    return res.status(500).json({ 
      error: 'Service temporarily unavailable. AWS credentials not configured.' 
    });
  }

  try {
    console.log('Attempting to list S3 objects...');
    // List all objects in the fresco-archive-data bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
    });

    console.log('Sending ListObjectsV2Command to S3...');
    const response = await s3Client.send(listCommand);
    console.log('S3 response received, Contents length:', response.Contents?.length || 0);

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
    console.error('=== S3 ERROR DETAILS ===');
    console.error('Error fetching archives from S3:', error);
    console.error('Error type:', typeof error);
    console.error('Error name:', error instanceof Error ? error.name : 'unknown');
    console.error('Error message:', error instanceof Error ? error.message : 'unknown');
    console.error('Error stack:', error instanceof Error ? error.stack : 'unknown');
    if (error && typeof error === 'object' && '$metadata' in error) {
      console.error('AWS SDK Error metadata:', (error as any).$metadata);
    }
    console.error('=== END S3 ERROR DETAILS ===');
    res.status(500).json({ error: 'Failed to fetch archives' });
  }
}
