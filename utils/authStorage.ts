// utils/authStorage.ts
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_TOKEN = "auth_token";         // hanya access token kecil (SecureStore)
const KEY_REFRESH = "auth_refresh";     // optional: refresh token (SecureStore)
const KEY_PROFILE = "user_profile";     // profile disimpan di AsyncStorage (non-sensitive)

export type StoredProfile = {
  id?: string | null;
  role?: string | null;
  name?: string | null;
  photo_url?: string | null;
  [k: string]: any;
};

// --- SecureStore (secrets kecil) ---
export async function setAuthToken(token: string | null) {
  try {
    if (token == null) {
      await SecureStore.deleteItemAsync(KEY_TOKEN);
      return;
    }
    await SecureStore.setItemAsync(KEY_TOKEN, token);
  } catch (e) {
    console.warn("setAuthToken failed", e);
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_TOKEN);
  } catch (e) {
    console.warn("getAuthToken failed", e);
    return null;
  }
}

export async function setRefreshToken(token: string | null) {
  try {
    if (token == null) {
      await SecureStore.deleteItemAsync(KEY_REFRESH);
      return;
    }
    await SecureStore.setItemAsync(KEY_REFRESH, token);
  } catch (e) {
    console.warn("setRefreshToken failed", e);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_REFRESH);
  } catch (e) {
    console.warn("getRefreshToken failed", e);
    return null;
  }
}

// --- AsyncStorage (non-sensitive / potentially large) ---
export async function setUserProfile(profile: Record<string, any> | null) {
  try {
    if (profile == null) {
      await AsyncStorage.removeItem(KEY_PROFILE);
      return;
    }

    // Normalisasi: ambil minimal fields dan normalisasi role jadi string (lowercase)
    const stored: StoredProfile = {
      id: profile.id ?? profile.profile?.id ?? null,
      name: profile.name ?? profile.profile?.name ?? null,
      photo_url: profile.photo_url ?? profile.profile?.photo_url ?? null,
      role: (() => {
        const r = profile.role ?? profile.profile?.role ?? null;
        if (!r) return null;
        if (Array.isArray(r)) return (r[0] ?? "").toString().toLowerCase();
        return String(r).toLowerCase();
      })(),
    };

    await AsyncStorage.setItem(KEY_PROFILE, JSON.stringify(stored));
  } catch (e) {
    console.warn("setUserProfile failed", e);
  }
}

export async function getUserProfile(): Promise<StoredProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PROFILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.role && typeof parsed.role === "string") {
      parsed.role = parsed.role.toLowerCase();
    }
    return parsed;
  } catch (e) {
    console.warn("getUserProfile failed", e);
    return null;
  }
}

// --- Clear helper ---
export async function clearAuthAll() {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_TOKEN).catch(()=>{}),
      SecureStore.deleteItemAsync(KEY_REFRESH).catch(()=>{}),
      AsyncStorage.removeItem(KEY_PROFILE).catch(()=>{}),
    ]);
  } catch (e) {
    console.warn("clearAuthAll failed", e);
  }
}


export default { getAuthToken, getUserProfile, setAuthToken, setUserProfile, clearAuthAll };

