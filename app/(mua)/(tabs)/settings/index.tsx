// app/(mua)/settings.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const API_ROOT = "https://smstudio.my.id/api";
const GET_ME = `${API_ROOT}/auth/me`;
const PATCH_ONLINE = `${API_ROOT}/auth/profile/online`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";

/**
 * Small fetch helper that ensures JSON responses and returns helpful errors.
 */
async function fetchJSON(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const ct = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!ct.includes("application/json")) {
    const snippet = raw ? raw.slice(0, 300).replace(/\s+/g, " ") : "";
    const err: any = new Error(`${res.status} ${res.statusText} – expected JSON, got: ${snippet}`);
    err.status = res.status;
    throw err;
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    const err: any = new Error("Response is not valid JSON.");
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return json;
}

export default function MuaSettings() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [loadingOnline, setLoadingOnline] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  // Bootstrap auth — coba beberapa sumber agar kompatibel dengan berbagai login shapes
  useEffect(() => {
    (async () => {
      try {
        // 1) coba SecureStore key "auth" (legacy)
        const rawAuth = await SecureStore.getItemAsync("auth").catch(() => null);
        if (rawAuth) {
          try {
            const parsed = JSON.parse(rawAuth);
            const maybeToken = parsed?.token ?? parsed?.accessToken ?? parsed?.access_token ?? null;
            if (maybeToken) setToken(String(maybeToken));
            const maybeProfileId = parsed?.profile?.id ?? parsed?.user?.id ?? parsed?.profile_id ?? null;
            if (maybeProfileId) setProfileId(String(maybeProfileId));
          } catch {
            // kalau rawAuth bukan JSON (mis. token string), treat sebagai token
            if (typeof rawAuth === "string" && rawAuth.length > 0) setToken(rawAuth);
          }
        }

        // 2) coba SecureStore key "auth_token"
        if (!token) {
          const tok2 = await SecureStore.getItemAsync("auth_token").catch(() => null);
          if (tok2) setToken(tok2);
        }

        // 3) coba AsyncStorage key "user_profile"
        if (!profileId) {
          try {
            const rawProfile = await AsyncStorage.getItem("user_profile").catch(() => null);
            if (rawProfile) {
              const p = JSON.parse(rawProfile);
              if (p?.id) setProfileId(String(p.id));
            }
          } catch {}
        }
      } catch (e) {
        console.warn("bootstrap auth failed:", e);
      } finally {
        setTokenReady(true);
      }
    })();
  }, []);

  // Force logout helper
  const doForceLogout = useCallback(
    async (message?: string) => {
      await SecureStore.deleteItemAsync("auth").catch(() => {});
      await SecureStore.deleteItemAsync("auth_token").catch(() => {});
      await AsyncStorage.removeItem("user_profile").catch(() => {});
      Alert.alert("Sesi berakhir", message ?? "Silakan login kembali.", [
        { text: "OK", onPress: () => router.replace("/(auth)/login") },
      ]);
    },
    [router]
  );

  // Load status online from GET /auth/me
  useEffect(() => {
    if (!tokenReady) return;

    (async () => {
      setLoadingOnline(true);

      // jika tidak ada token, skip memanggil /auth/me
      if (!token) {
        console.log("No token found — skip GET /auth/me");
        setIsOnline(false);
        setLoadingOnline(false);
        return;
      }

      try {
        const json = await fetchJSON(GET_ME, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const me = json?.data ?? json;
        const profile = me?.profile ?? me;
        const val = !!(profile?.is_online ?? profile?.online ?? profile?.status_online);
        setIsOnline(val);

        const id = profile?.id ?? me?.id;
        if (id) setProfileId(String(id));
      } catch (e: any) {
        console.warn("Failed GET /auth/me:", e?.message || e);
        if (e?.status === 401) {
          // token invalid/expired
          await doForceLogout("Autentikasi tidak valid. Silakan login kembali.");
          return;
        }
        Alert.alert("Gagal memuat profil", e?.message || "Tidak dapat memuat profil.");
      } finally {
        setLoadingOnline(false);
      }
    })();
  }, [tokenReady, token, doForceLogout]);

  // Update online via PATCH /auth/profile/online
  const updateOnline = useCallback(
    async (val: boolean) => {
      if (!token) {
        Alert.alert("Butuh Login", "Silakan login untuk mengubah status online.");
        return;
      }

      const prev = isOnline;
      setIsOnline(val);
      setSavingOnline(true);

      try {
        await fetchJSON(PATCH_ONLINE, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_online: val }),
        });
      } catch (e: any) {
        console.warn("Failed PATCH /auth/profile/online:", e?.message || e);
        setIsOnline(prev);
        if (e?.status === 401) {
          await doForceLogout("Autentikasi tidak valid. Silakan login kembali.");
          return;
        }
        Alert.alert("Gagal menyimpan", e?.message || "Tidak dapat menyimpan status online.");
      } finally {
        setSavingOnline(false);
      }
    },
    [token, isOnline, doForceLogout]
  );

  async function logout() {
    await SecureStore.deleteItemAsync("auth").catch(() => {});
    await SecureStore.deleteItemAsync("auth_token").catch(() => {});
    await AsyncStorage.removeItem("user_profile").catch(() => {});
    router.replace("/(auth)/login");
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Settings</Text>

      <TouchableOpacity style={styles.row} onPress={() => router.push("profile")}>
        <Ionicons name="person-circle-outline" size={20} color="#111827" />
        <Text style={styles.rowText}>Edit Profile</Text>
        <Ionicons name="chevron-forward" size={16} color="#6B7280" />
      </TouchableOpacity>

      <View style={styles.row}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Ionicons name={isOnline ? "wifi" : "wifi-outline"} size={20} color={isOnline ? PURPLE : "#111827"} />
          <Text style={styles.rowText}>Status: {isOnline ? "Online" : "Offline"}</Text>
        </View>

        {loadingOnline ? (
          <ActivityIndicator />
        ) : (
          <Switch
            value={isOnline}
            onValueChange={(v) => updateOnline(v)}
            disabled={savingOnline}
            trackColor={{ false: "#D1D5DB", true: "#D8B4FE" }}
            thumbColor={isOnline ? PURPLE : "#f4f3f4"}
          />
        )}
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={{ color: "#DC2626", fontWeight: "800", marginLeft: 8 }}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", padding: 16 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12, color: "#111827" },
  row: {
    height: 56,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  rowText: { flex: 1, marginLeft: 10, fontWeight: "700", color: "#111827" },
  logout: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 18,
  },
});
