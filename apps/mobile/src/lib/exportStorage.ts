// apps/mobile/src/lib/exportStorage.ts
import * as FileSystem from "expo-file-system/legacy";

function safeProjectKey(k: string) {
  return String(k || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

function safeFilename(name: string) {
  return String(name || "file")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 160);
}

function baseDir() {
  const root = String(FileSystem.documentDirectory || "").trim();
  if (!root) throw new Error("FileSystem.documentDirectory fehlt");
  return root.endsWith("/") ? root : `${root}/`;
}

async function ensureDir(dirUri: string) {
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (info.exists && info.isDirectory) return;
    if (info.exists && !info.isDirectory) {
      await FileSystem.deleteAsync(dirUri, { idempotent: true });
    }
  } catch {}
  await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
}

export type ExportKind = "regie" | "lieferschein" | "photos";
export type ExportFileType = "pdf" | "csv";

export type ExportMetaItem = {
  kind: ExportKind;
  fileType: ExportFileType;
  name: string;     // filename
  uri: string;      // local uri
  size?: number;
  mtime?: string;
};

function exportDir(projectFsKey: string, kind: ExportKind) {
  const k = safeProjectKey(projectFsKey);
  return `${baseDir()}rlc_exports/${k}/${kind}/`;
}

function exportFileUri(projectFsKey: string, kind: ExportKind, filename: string) {
  return `${exportDir(projectFsKey, kind)}${safeFilename(filename)}`;
}

export async function writeExportTextFile(opts: {
  projectFsKey: string;
  kind: ExportKind;
  filename: string; // should include .csv
  content: string;
}): Promise<{ uri: string; name: string }> {
  const dir = exportDir(opts.projectFsKey, opts.kind);
  await ensureDir(dir);

  const uri = exportFileUri(opts.projectFsKey, opts.kind, opts.filename);
  await FileSystem.writeAsStringAsync(uri, opts.content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { uri, name: safeFilename(opts.filename) };
}

export async function moveExportFile(opts: {
  projectFsKey: string;
  kind: ExportKind;
  filename: string; // should include .pdf
  fromUri: string;  // temp file uri
}): Promise<{ uri: string; name: string }> {
  const dir = exportDir(opts.projectFsKey, opts.kind);
  await ensureDir(dir);

  const uri = exportFileUri(opts.projectFsKey, opts.kind, opts.filename);

  // idempotent overwrite
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}

  await FileSystem.copyAsync({ from: opts.fromUri, to: uri });

  // cleanup temp (best effort)
  try {
    await FileSystem.deleteAsync(opts.fromUri, { idempotent: true });
  } catch {}

  return { uri, name: safeFilename(opts.filename) };
}

export async function listExportFiles(projectFsKey: string, kind?: ExportKind): Promise<ExportMetaItem[]> {
  const kinds: ExportKind[] = kind ? [kind] : ["regie", "lieferschein", "photos"];
  const out: ExportMetaItem[] = [];

  for (const k of kinds) {
    const dir = exportDir(projectFsKey, k);

    try {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists || !dirInfo.isDirectory) continue;
    } catch {
      continue;
    }

    let names: string[] = [];
    try {
      names = await FileSystem.readDirectoryAsync(dir);
    } catch {
      continue;
    }

    for (const raw of names) {
      const name = String(raw || "").trim();
      if (!name) continue;
      const uri = `${dir}${name}`;

      try {
        const info: any = await FileSystem.getInfoAsync(uri);
        if (!info?.exists || info?.isDirectory) continue;

        const mt =
          typeof info?.modificationTime === "number"
            ? new Date(info.modificationTime * 1000).toISOString()
            : undefined;

        const lower = name.toLowerCase();
        const fileType: ExportFileType =
          lower.endsWith(".csv") ? "csv" : "pdf";

        out.push({
          kind: k,
          fileType,
          name,
          uri,
          size: typeof info?.size === "number" ? info.size : undefined,
          mtime: mt,
        });
      } catch {}
    }
  }

  out.sort((a, b) => {
    const ta = a.mtime ? Date.parse(a.mtime) : 0;
    const tb = b.mtime ? Date.parse(b.mtime) : 0;
    if (tb !== ta) return tb - ta;
    return String(a.name).localeCompare(String(b.name));
  });

  return out;
}
