// utils/authStorage.ts  (ubah bagian AsyncStorage)
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PROFILE = "user_profile";

// ... tetap gunakan setAuthToken/getAuthToken seperti sekarang ...

export async function setUserProfile(profile: Record<string, any> | null) {
  try {
    if (profile == null) {
      await AsyncStorage.removeItem(KEY_PROFILE);
      return;
    }

    // Normalisasi: ambil minimal fields dan normalisasi role jadi string (lowercase)
    const stored = {
      id: profile.id ?? profile.profile?.id ?? null,
      name: profile.name ?? profile.profile?.name ?? null,
      // role bisa berupa string, array, atau null -> ubah jadi string sederhana
      role: (() => {
        const r = profile.role ?? profile.profile?.role ?? null;
        if (!r) return null;
        if (Array.isArray(r)) return (r[0] ?? "").toString().toLowerCase();
        return String(r).toLowerCase();
      })(),
      // optionally keep other small fields if needed
      photo_url: profile.photo_url ?? profile.profile?.photo_url ?? null,
    };

    await AsyncStorage.setItem(KEY_PROFILE, JSON.stringify(stored));
  } catch (e) {
    console.warn("setUserProfile failed", e);
  }
}

export async function getUserProfile(): Promise<Record<string, any> | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PROFILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // ensure role normalized
    if (parsed?.role && typeof parsed.role === "string") {
      parsed.role = parsed.role.toLowerCase();
    }
    return parsed;
  } catch (e) {
    console.warn("getUserProfile failed", e);
    return null;
  }
}
