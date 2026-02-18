import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppMode = "NUR_APP" | "SERVER_SYNC";
const KEY = "rlc_app_mode_v1";

export async function getAppMode(): Promise<AppMode | null> {
  const v = (await AsyncStorage.getItem(KEY)) || "";
  if (v === "NUR_APP" || v === "SERVER_SYNC") return v;
  return null;
}

export async function setAppMode(mode: AppMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode);
}

export async function clearAppMode(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
