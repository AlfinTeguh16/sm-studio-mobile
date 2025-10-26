// utils/migrateAuth.ts
import * as SecureStore from "expo-secure-store";
import { setAuthToken, setRefreshToken, setUserProfile } from "./authStorage";

const OLD_KEY = "auth"; // kunci lama yang mungkin menyimpan objek besar

export async function migrateAuthIfNeeded() {
  try {
    const raw = await SecureStore.getItemAsync(OLD_KEY);
    if (!raw) {
      // nothing to migrate
      return;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // tidak JSON -> tidak bisa diinterpretasi, hapus saja untuk mencegah warning selanjutnya
      console.warn("migrateAuth: old 'auth' not json, deleting old key");
      await SecureStore.deleteItemAsync(OLD_KEY).catch(()=>{});
      return;
    }

    // parsed mungkin berbentuk: { token, refresh_token, profile, user, ... }
    if (parsed?.token && typeof parsed.token === "string") {
      await setAuthToken(parsed.token);
    }
    if (parsed?.refresh_token && typeof parsed.refresh_token === "string") {
      await setRefreshToken(parsed.refresh_token);
    }

    // profile/user bisa besar — pindahkan ke AsyncStorage via setUserProfile
    const profile = parsed?.profile ?? parsed?.user ?? null;
    if (profile) {
      await setUserProfile(profile);
    }

    // setelah sukses, hapus kunci lama supaya tidak terus memicu warning
    await SecureStore.deleteItemAsync(OLD_KEY).catch(()=>{});
    console.log("migrateAuthIfNeeded: migrated and removed old 'auth' key");
  } catch (e) {
    console.warn("migrateAuthIfNeeded failed:", e);
  }
}
