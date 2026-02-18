// apps/mobile/src/lib/openPdf.ts
import { Alert, Linking, Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as FileSystem from "expo-file-system"; // ONLY for Android contentUri bridge (no dirs)

function isHttp(u: string) {
  return /^https?:\/\//i.test(u);
}
function isFile(u: string) {
  return /^file:\/\//i.test(u);
}
function isContent(u: string) {
  return /^content:\/\//i.test(u);
}

export async function openPdfUri(rawUri: string) {
  const uri = String(rawUri || "").trim();
  if (!uri) throw new Error("openPdfUri: uri fehlt");

  // iOS: Linking.openURL(file:// or https://) works (Files/iCloud will hand back a readable URL)
  if (Platform.OS === "ios") {
    const ok = await Linking.canOpenURL(uri);
    if (!ok) throw new Error(`Kann PDF nicht öffnen (iOS canOpenURL=false): ${uri}`);
    await Linking.openURL(uri);
    return;
  }

  // Android
  if (Platform.OS === "android") {
    // If it's already a content:// uri -> open via Intent
    if (isContent(uri)) {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: uri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: "application/pdf",
      });
      return;
    }

    // If it's file:// uri -> convert to content:// using FileSystem.getContentUriAsync
    if (isFile(uri)) {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/pdf",
      });
      return;
    }

    // If it's https:// -> just open link (system will route)
    if (isHttp(uri)) {
      const ok = await Linking.canOpenURL(uri);
      if (!ok) throw new Error(`Kann URL nicht öffnen: ${uri}`);
      await Linking.openURL(uri);
      return;
    }

    // fallback try
    const ok = await Linking.canOpenURL(uri);
    if (!ok) throw new Error(`Kann URI nicht öffnen: ${uri}`);
    await Linking.openURL(uri);
    return;
  }

  // Other platforms: best-effort
  const ok = await Linking.canOpenURL(uri);
  if (!ok) throw new Error(`Kann URI nicht öffnen: ${uri}`);
  await Linking.openURL(uri);
}

// small wrapper for UI
export async function openPdfOrAlert(uri: string) {
  try {
    await openPdfUri(uri);
  } catch (e: any) {
    Alert.alert("PDF öffnen", e?.message || String(e));
  }
}
