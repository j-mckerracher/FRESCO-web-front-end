import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Check environment variables
    const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
    const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";

    // Try to import AWS SDK
    let sdkAvailable = true;
    let s3Client;
    try {
      const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
    } catch (error) {
      sdkAvailable = false;
    }

    // Try a simple S3 operation
    let s3Test = null;
    if (sdkAvailable && hasAccessKey && hasSecretKey) {
      try {
        const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
        const command = new ListObjectsV2Command({
          Bucket: "fresco-archive-data",
          MaxKeys: 1, // Just test connectivity
        });
        const response = await s3Client.send(command);
        s3Test = {
          success: true,
          keyCount: response.KeyCount || 0,
        };
      } catch (error) {
        s3Test = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    res.status(200).json({
      environment: process.env.NODE_ENV,
      credentials: {
        hasAccessKey,
        hasSecretKey,
        region,
      },
      sdk: {
        available: sdkAvailable,
      },
      s3Test,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}