import * as FileSystem from "expo-file-system";

function pickBaseDir() {
  // su iOS/Expo Go documentDirectory può essere null in rari casi, fallback su cacheDirectory
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null;
}

export function requireBaseDir(): string {
  const base = pickBaseDir();
  if (!base) throw new Error("FileSystem base directory missing (document/cache).");
  return base.endsWith("/") ? base : base + "/";
}

export async function ensureDir(dirUri: string) {
  const uri = dirUri.endsWith("/") ? dirUri : dirUri + "/";
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  }
  return uri;
}

// cartelle standard RLC
export async function getRlcCacheDir() {
  const base = requireBaseDir();
  return ensureDir(`${base}rlc/cache/`);
}

export async function getProjectPdfDir(projectFsKey: string) {
  const base = requireBaseDir();
  return ensureDir(`${base}rlc/pdfs/${projectFsKey}/`);
}
