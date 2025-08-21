import type { NextApiRequest, NextApiResponse } from "next";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import { getEnv } from "@/lib/env";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const { region, roleArn, bucket } = getEnv();
    const provider = awsCredentialsProvider({ roleArn });
    const sts = new STSClient({ region, credentials: provider });
    const who = await sts.send(new GetCallerIdentityCommand({}));

    const s3 = new S3Client({ region, credentials: provider });
    let head: any = true;
    try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch (e: any) { head = { name: e?.name, http: e?.$metadata?.httpStatusCode, code: e?.Code || e?.code, message: e?.message }; }

    const creds = await provider();

    return res.status(200).json({
      ok: true,
      env: { region, roleArn: roleArn.slice(0, 20) + "...", bucket },
      callerIdentity: { Account: who.Account, Arn: who.Arn, UserId: who.UserId },
      creds: {
        keyPrefix: creds.accessKeyId.slice(0, 4),
        keySuffix: creds.accessKeyId.slice(-4),
        hasSessionToken: !!creds.sessionToken,
      },
      headBucket: head,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message, name: err?.name });
  }
}
