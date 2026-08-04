import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppMode = "NUR_APP" | "SERVER_SYNC";
const KEY = "rlc_mobile_mode";
const LEGACY_KEY = "rlc_app_mode_v1";

export async function getAppMode(): Promise<AppMode | null> {
  const v =
    (await AsyncStorage.getItem(KEY)) ||
    (await AsyncStorage.getItem(LEGACY_KEY)) ||
    "";
  if (v === "NUR_APP" || v === "SERVER_SYNC") return v;
  return null;
}

export async function setAppMode(mode: AppMode): Promise<void> {
  await AsyncStorage.multiSet([
    [KEY, mode],
    [LEGACY_KEY, mode],
  ]);
}

export async function clearAppMode(): Promise<void> {
  await AsyncStorage.multiRemove([KEY, LEGACY_KEY]);
}

