import { S3Client } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import { getEnv } from "@/lib/env";

const { region, roleArn } = getEnv();
export const s3 = new S3Client({
  region,
  credentials: awsCredentialsProvider({ roleArn }),
});
