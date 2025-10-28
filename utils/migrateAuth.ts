// utils/migrateAuth.ts
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthToken, setUserProfile, getAuthToken, getUserProfile } from "./authStorage";

const LEGACY_KEY = "auth"; // key lama yang dipakai sebelumnya in repo

export async function migrateAuthIfNeeded(): Promise<{ migrated: boolean; reason?: string }>{
  try {
    // 1) check SecureStore legacy key
    const legacySecure = await SecureStore.getItemAsync(LEGACY_KEY);
    if (legacySecure) {
      try {
        const parsed = JSON.parse(legacySecure);
        const token = parsed?.token ?? parsed?.authToken ?? null;
        const profile = parsed?.profile ?? parsed?.user ?? null;

        if (token) await setAuthToken(token);
        if (profile) await setUserProfile(profile);
        // remove legacy
        await SecureStore.deleteItemAsync(LEGACY_KEY).catch(()=>{});
        return { migrated: true, reason: "migrated secureStore auth" };
      } catch (e) {
        // ignore json parse error, continue to check AsyncStorage legacy
      }
    }

    // 2) check AsyncStorage legacy key (some versions used AsyncStorage for 'auth')
    const legacyAsync = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacyAsync) {
      try {
        const parsed = JSON.parse(legacyAsync);
        const token = parsed?.token ?? parsed?.authToken ?? null;
        const profile = parsed?.profile ?? parsed?.user ?? null;

        if (token) await setAuthToken(token);
        if (profile) await setUserProfile(profile);
        await AsyncStorage.removeItem(LEGACY_KEY).catch(()=>{});
        return { migrated: true, reason: "migrated asyncStorage auth" };
      } catch (e) {
        // ignore
      }
    }

    // nothing to do
    return { migrated: false, reason: "nothing to migrate" };
  } catch (ex) {
    console.warn("migrateAuthIfNeeded failed", ex);
    return { migrated: false, reason: String(ex) };
  }
}
