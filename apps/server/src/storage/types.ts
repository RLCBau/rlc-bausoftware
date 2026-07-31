export type StorageHealth = {
  ok: boolean;
  provider: string;
  bucket?: string;
  endpoint?: string;
  error?: string;
};

export type PutInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
};

export interface StorageProvider {
  readonly name: string;
  health(): Promise<StorageHealth>;
  put(input: PutInput): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  presignPut(key: string, contentType?: string, expiresIn?: number): Promise<string>;
  presignGet(key: string, expiresIn?: number): Promise<string>;
}
