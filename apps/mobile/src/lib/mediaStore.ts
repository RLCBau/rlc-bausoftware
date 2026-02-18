import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

function normDir(d: string) {
  return d.endsWith("/") ? d : d + "/";
}

async function ensureDir(dir: string) {
  const d = normDir(dir);
  const info = await FileSystem.getInfoAsync(d);
  if (!info.exists) await FileSystem.makeDirectoryAsync(d, { intermediates: true });
}

function safeExt(name?: string, type?: string) {
  const n = String(name || "").toLowerCase();
  const t = String(type || "").toLowerCase();
  if (t.includes("png") || n.endsWith(".png")) return "png";
  return "jpg";
}

function isIosPh(u?: string) {
  return typeof u === "string" && (u.startsWith("ph://") || u.startsWith("assets-library://"));
}
function isContent(u?: string) {
  return typeof u === "string" && u.startsWith("content://");
}
function isFile(u?: string) {
  return typeof u === "string" && u.startsWith("file://");
}

async function toReadableFileUri(inputUri: string): Promise<string> {
  if (Platform.OS === "web") return inputUri;
  if (isFile(inputUri)) return inputUri;

  // content:// -> copy in cache
  if (isContent(inputUri)) {
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) return inputUri;
    const tmpDir = `${normDir(base)}tmp/`;
    await ensureDir(tmpDir);
    const target = `${tmpDir}${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`;
    await FileSystem.copyAsync({ from: inputUri, to: target });
    return target.startsWith("file://") ? target : `file://${target}`;
  }

  // ph:// -> convert to jpeg in cache
  if (isIosPh(inputUri)) {
    const out = await ImageManipulator.manipulateAsync(
      inputUri,
      [{ resize: { width: 1400 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri;
  }

  return inputUri;
}

export async function persistAttachmentToProject(params: {
  projectFsKey: string;
  uri: string;
  name?: string;
  type?: string;
}) {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) return { ...params };

  const mediaDir = `${normDir(base)}projects/${params.projectFsKey}/media/`;
  await ensureDir(mediaDir);

  const ext = safeExt(params.name, params.type);
  const fileName = `img_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
  const target = `${mediaDir}${fileName}`;

  const readable = await toReadableFileUri(params.uri);

  // Copia sempre in dir progetto (persistente)
  await FileSystem.copyAsync({ from: readable, to: target });

  return {
    uri: target,
    name: params.name || fileName,
    type: params.type || (ext === "png" ? "image/png" : "image/jpeg"),
  };
}
