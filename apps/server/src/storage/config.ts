import path from "path";

export type StorageConfig = {
  provider: "local" | "s3";
  localRoot: string;
  s3: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
  };
};

function required(name: string, value?: string): string {
  if (!value?.trim()) throw new Error(`[storage] Missing environment variable ${name}`);
  return value.trim();
}

export function loadStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
  if (provider !== "local" && provider !== "s3") {
    throw new Error(`[storage] Unsupported STORAGE_PROVIDER=${provider}`);
  }

  const config: StorageConfig = {
    provider,
    localRoot: path.resolve(process.env.STORAGE_LOCAL_ROOT || process.env.PROJECTS_ROOT || "/app/data/projects"),
    s3: {
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      region: process.env.S3_REGION?.trim() || "eu-central-1",
      bucket: process.env.S3_BUCKET?.trim() || "rlc-storage",
      accessKeyId: process.env.S3_ACCESS_KEY?.trim() || undefined,
      secretAccessKey: process.env.S3_SECRET_KEY?.trim() || undefined,
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "false").toLowerCase() === "true",
    },
  };

  if (provider === "s3") {
    required("S3_BUCKET", process.env.S3_BUCKET);
    required("S3_ACCESS_KEY", process.env.S3_ACCESS_KEY);
    required("S3_SECRET_KEY", process.env.S3_SECRET_KEY);
  }

  return config;
}
