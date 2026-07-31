import { loadStorageConfig } from "./config";
import { LocalStorageProvider } from "./providers/localStorageProvider";
import { S3StorageProvider } from "./providers/s3StorageProvider";

const config = loadStorageConfig();

export const storage = config.provider === "s3"
  ? new S3StorageProvider(config.s3)
  : new LocalStorageProvider(config.localRoot);

export const storageConfig = config;

export function objectKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => String(part).replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
