import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }
});
const BUCKET = process.env.S3_BUCKET!;

export async function presignPut(key: string, mime: string) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mime }), { expiresIn: 900 });
}
export async function presignGet(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 900 });
}
