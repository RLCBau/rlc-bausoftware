import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT!;
const region = process.env.S3_REGION || "eu-central-1";
const accessKeyId = process.env.S3_ACCESS_KEY!;
const secretAccessKey = process.env.S3_SECRET_KEY!;
const bucket = process.env.S3_BUCKET!;
const useSSL = String(process.env.S3_USE_SSL || "false") === "true";

export const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  tls: useSSL,
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function presignPut(key: string, contentType: string, expiresSec = 900): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn: expiresSec });
}

export async function presignGet(key: string, expiresSec = 900): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresSec });
}

export function objectKey(projectId: string, docId: string, version: number, filename: string) {
  return `projects/${projectId}/${docId}/v${version}/${filename}`;
}

export { bucket };
