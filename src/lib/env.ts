export function getEnv() {
  const region = process.env.AWS_REGION || "us-east-1";
  const roleArn = process.env.AWS_ROLE_ARN;
  const bucket = process.env.S3_BUCKET_NAME || "fresco-archive-data";
  const missing: string[] = [];
  if (!roleArn) missing.push("AWS_ROLE_ARN");
  if (!bucket) missing.push("S3_BUCKET_NAME");
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
  return { region, roleArn, bucket };
}
