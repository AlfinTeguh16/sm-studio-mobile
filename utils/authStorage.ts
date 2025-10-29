// utils/authStorage.ts
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_TOKEN = "auth_token";         // hanya access token kecil (SecureStore)
const KEY_REFRESH = "auth_refresh";     // optional: refresh token (SecureStore)
const KEY_PROFILE = "user_profile";     // profile disimpan di AsyncStorage (non-sensitive)
const LEGACY_AUTH_KEY = "auth";         // some apps stored whole auth JSON under "auth"

export type StoredProfile = {
  id?: string | null;
  role?: string | null;
  name?: string | null;
  photo_url?: string | null;
  [k: string]: any;
};

function tryParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractTokenFromObject(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  const candidates = [
    obj?.token,
    obj?.access_token,
    obj?.accessToken,
    obj?.data?.token,
    obj?.user?.token,
    obj?.user?.access_token,
    obj?.meta?.token,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

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
    // 1) direct token key (preferred)
    const direct = await SecureStore.getItemAsync(KEY_TOKEN);
    if (direct) {
      return direct;
    }

    // 2) legacy: SecureStore 'auth' JSON
    const legacySecure = await SecureStore.getItemAsync(LEGACY_AUTH_KEY);
    const parsedSecure = tryParseJson(legacySecure);
    const fromSecureLegacy = extractTokenFromObject(parsedSecure);
    if (fromSecureLegacy) {
      console.debug("[authStorage] token from SecureStore legacy 'auth'");
      return fromSecureLegacy;
    }

    // 3) AsyncStorage stored token or legacy auth JSON
    const directAsync = await AsyncStorage.getItem(KEY_TOKEN);
    if (directAsync) return directAsync;

    const legacyAsync = await AsyncStorage.getItem(LEGACY_AUTH_KEY);
    const parsedAsync = tryParseJson(legacyAsync);
    const fromAsyncLegacy = extractTokenFromObject(parsedAsync);
    if (fromAsyncLegacy) {
      console.debug("[authStorage] token from AsyncStorage legacy 'auth'");
      return fromAsyncLegacy;
    }

    // 4) sometimes profile store contains nested token (unlikely but safe)
    const profileRaw = await AsyncStorage.getItem(KEY_PROFILE);
    const parsedProfile = tryParseJson(profileRaw);
    const fromProfile = extractTokenFromObject(parsedProfile);
    if (fromProfile) {
      console.debug("[authStorage] token extracted from stored profile");
      return fromProfile;
    }

    return null;
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
    const direct = await SecureStore.getItemAsync(KEY_REFRESH);
    if (direct) return direct;

    // fallback to legacy auth object
    const legacySecure = await SecureStore.getItemAsync(LEGACY_AUTH_KEY);
    const parsed = tryParseJson(legacySecure);
    const candidates = [
      parsed?.refresh_token,
      parsed?.refreshToken,
      parsed?.data?.refresh_token,
      parsed?.user?.refresh_token,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c;
    }

    // AsyncStorage fallback
    const legacyAsync = await AsyncStorage.getItem(LEGACY_AUTH_KEY);
    const parsedAsync = tryParseJson(legacyAsync);
    for (const c of [
      parsedAsync?.refresh_token,
      parsedAsync?.refreshToken,
      parsedAsync?.data?.refresh_token,
      parsedAsync?.user?.refresh_token,
    ]) {
      if (typeof c === "string" && c.trim()) return c;
    }

    return null;
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
      id: profile.id ?? profile.profile?.id ?? profile.user?.id ?? null,
      name: profile.name ?? profile.profile?.name ?? profile.user?.name ?? null,
      photo_url:
        profile.photo_url ??
        profile.profile?.photo_url ??
        profile.user?.photo_url ??
        profile.user?.avatar ??
        null,
      role: (() => {
        const r = profile.role ?? profile.profile?.role ?? profile.user?.role ?? null;
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
    if (raw) {
      const parsed = tryParseJson(raw);
      if (parsed?.role && typeof parsed.role === "string") {
        parsed.role = parsed.role.toLowerCase();
      }
      return parsed;
    }

    // fallback: maybe whole auth stored under "auth" contains profile/user
    const legacy = await AsyncStorage.getItem(LEGACY_AUTH_KEY) || await SecureStore.getItemAsync(LEGACY_AUTH_KEY);
    const parsedLegacy = tryParseJson(legacy);
    if (parsedLegacy) {
      // try common shapes: { profile: {...} } or { user: {...} } or top-level fields
      const cand = parsedLegacy?.profile ?? parsedLegacy?.user ?? parsedLegacy;
      const normalized: StoredProfile = {
        id: cand?.id ?? cand?.profile?.id ?? null,
        name: cand?.name ?? cand?.full_name ?? null,
        photo_url: cand?.photo_url ?? cand?.avatar ?? null,
        role: (() => {
          const r = cand?.role ?? cand?.roles ?? null;
          if (!r) return null;
          if (Array.isArray(r)) return (r[0] ?? "").toString().toLowerCase();
          return String(r).toLowerCase();
        })(),
      };
      return normalized;
    }

    return null;
  } catch (e) {
    console.warn("getUserProfile failed", e);
    return null;
  }
}

// --- Clear helper ---
export async function clearAuthAll() {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_TOKEN).catch(() => {}),
      SecureStore.deleteItemAsync(KEY_REFRESH).catch(() => {}),
      SecureStore.deleteItemAsync(LEGACY_AUTH_KEY).catch(() => {}),
      AsyncStorage.removeItem(KEY_PROFILE).catch(() => {}),
      AsyncStorage.removeItem(LEGACY_AUTH_KEY).catch(() => {}),
    ]);
  } catch (e) {
    console.warn("clearAuthAll failed", e);
  }
}

export default {
  getAuthToken,
  getUserProfile,
  setAuthToken,
  setUserProfile,
  getRefreshToken,
  setRefreshToken,
  clearAuthAll,
};
