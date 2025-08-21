// pages/api/aws-debug.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/functions/oidc";

const REGION = process.env.AWS_REGION || "us-east-1";
const ROLE_ARN = process.env.AWS_ROLE_ARN!;
const BUCKET = process.env.S3_BUCKET_NAME || "fresco-archive-data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (!ROLE_ARN) {
            return res.status(500).json({ error: "Missing AWS_ROLE_ARN" });
        }

        // Build provider and peek at the actual temporary creds
        const provider = awsCredentialsProvider({ roleArn: ROLE_ARN });
        const creds = await provider(); // { accessKeyId, secretAccessKey, sessionToken, expiration }

        const sts = new STSClient({ region: REGION, credentials: provider });
        const who = await sts.send(new GetCallerIdentityCommand({}));

        const s3 = new S3Client({ region: REGION, credentials: provider });
        let bucketOk: unknown = null;
        try {
            await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
            bucketOk = true;
        } catch (e: any) {
            bucketOk = {
                name: e?.name,
                $metadata: e?.$metadata,
                code: e?.Code || e?.code,
                message: e?.message,
                bucket: BUCKET,
                regionTried: REGION,
            };
        }

        return res.status(200).json({
            ok: true,
            env: {
                AWS_REGION: REGION,
                AWS_ROLE_ARN: ROLE_ARN.slice(0, 20) + "...",
                S3_BUCKET_NAME: BUCKET,
            },
            callerIdentity: {
                Account: who.Account,
                Arn: who.Arn,
                UserId: who.UserId,
            },
            creds: {
                // expect "ASIA" for temporary creds
                keyPrefix: creds.accessKeyId.slice(0, 4),
                keySuffix: creds.accessKeyId.slice(-4),
                hasSessionToken: !!creds.sessionToken,
                expiresISO: (creds as any).expiration?.toISOString?.() ?? null,
            },
            headBucket: bucketOk,
        });
    } catch (err: any) {
        return res.status(500).json({
            ok: false,
            error: err?.message,
            name: err?.name,
            stack: err?.stack,
        });
    }
}
