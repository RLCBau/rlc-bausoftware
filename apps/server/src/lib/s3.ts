/**
 * Compatibility facade. Existing routes can keep importing from lib/s3 while
 * the real implementation is selected by the central StorageService.
 */
import { storage, storageConfig, objectKey } from "../storage/storageService";
import { S3StorageProvider } from "../storage/providers/s3StorageProvider";

export { objectKey };
export const bucket = storageConfig.s3.bucket;
export const s3 = storage instanceof S3StorageProvider ? storage.client : undefined;

export async function ensureBucket(): Promise<boolean> {
  return (await storage.health()).ok;
}

export function presignPut(key: string, contentType = "application/octet-stream") {
  return storage.presignPut(key, contentType, 900);
}

export function presignGet(key: string) {
  return storage.presignGet(key, 900);
}
