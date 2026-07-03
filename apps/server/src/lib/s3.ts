import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const bucket = process.env.S3_BUCKET || "rlc-storage";

export const s3 = new S3Client({
  region: process.env.S3_REGION || "eu-central-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials: process.env.S3_ENDPOINT
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
      }
    : undefined,
});

export function objectKey(...parts: Array<string | number | null | undefined>) {
  return parts
    .filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
    .map((x) => String(x).replace(/^\/+|\/+$/g, ""))
    .join("/");
}

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

export async function presignPut(key: string, contentType = "application/octet-stream") {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 900 }
  );
}

export async function presignGet(key: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 900 }
  );
}
