import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfig } from "../config";
import type { PutInput, StorageHealth, StorageProvider } from "../types";

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  readonly bucket: string;
  readonly endpoint?: string;
  readonly client: S3Client;

  constructor(config: StorageConfig["s3"]) {
    this.bucket = config.bucket;
    this.endpoint = config.endpoint;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
    });
  }

  async health(): Promise<StorageHealth> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true, provider: this.name, bucket: this.bucket, endpoint: this.endpoint };
    } catch (error: any) {
      return {
        ok: false,
        provider: this.name,
        bucket: this.bucket,
        endpoint: this.endpoint,
        error: error?.message || String(error),
      };
    }
  }

  async put(input: PutInput): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }));
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return streamToBuffer(result.Body);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
      throw error;
    }
  }

  presignPut(key: string, contentType = "application/octet-stream", expiresIn = 900): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    }), { expiresIn });
  }

  presignGet(key: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
}
