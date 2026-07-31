import fs from "fs";
import path from "path";
import type { PutInput, StorageHealth, StorageProvider } from "../types";

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  constructor(private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
  }

  private resolve(key: string): string {
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    const absolute = path.resolve(this.root, normalized);
    const base = path.resolve(this.root) + path.sep;
    if (absolute !== path.resolve(this.root) && !absolute.startsWith(base)) {
      throw new Error("Invalid storage key");
    }
    return absolute;
  }

  async health(): Promise<StorageHealth> {
    try {
      await fs.promises.access(this.root, fs.constants.R_OK | fs.constants.W_OK);
      return { ok: true, provider: this.name, endpoint: this.root };
    } catch (error: any) {
      return { ok: false, provider: this.name, endpoint: this.root, error: error?.message || String(error) };
    }
  }

  async put(input: PutInput): Promise<void> {
    const target = this.resolve(input.key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, input.body);
  }

  get(key: string): Promise<Buffer> { return fs.promises.readFile(this.resolve(key)); }
  async delete(key: string): Promise<void> { await fs.promises.rm(this.resolve(key), { force: true }); }
  async exists(key: string): Promise<boolean> { try { await fs.promises.access(this.resolve(key)); return true; } catch { return false; } }
  async presignPut(): Promise<string> { throw new Error("Presigned URLs require STORAGE_PROVIDER=s3"); }
  async presignGet(): Promise<string> { throw new Error("Presigned URLs require STORAGE_PROVIDER=s3"); }
}
