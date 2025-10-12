import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch, ActivityIndicator } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";

async function fetchJSON(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",        // penting: paksa JSON
      ...(options.headers || {}),
    },
  });

  const ct = res.headers.get("content-type") || "";
  const raw = await res.text();          // baca sebagai text dulu

  if (!ct.includes("application/json")) {
    // backend mengirim HTML / bukan JSON -> buat error yang jelas
    throw new Error(`${res.status} ${res.statusText} – expected JSON, got: ${raw.slice(0, 200)}`);
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Response is not valid JSON.");
  }

  if (!res.ok) {
    // ambil pesan error dari JSON jika ada
    const msg = json?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return json;
}

export default function MuaSettings() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [loadingOnline, setLoadingOnline] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  // Ambil token + profileId
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          setToken(auth?.token ?? null);
          setProfileId(auth?.profile?.id ?? auth?.user?.profile?.id ?? auth?.user?.id ?? null);
        }
      } catch {}
    })();
  }, []);

  // Load status online
  useEffect(() => {
    if (!profileId) return;

    (async () => {
      setLoadingOnline(true);
      try {
        const json = await fetchJSON(`${API}/mua/${profileId}`, {
          // kirim token kalau ada (kalau route butuh auth)
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = json?.data ?? json;
        setIsOnline(!!data?.is_online);
      } catch (e: any) {
        // tampilkan potongan error agar tahu kalau yang datang HTML/redirect
        Alert.alert("Gagal", e?.message || "Tidak bisa memuat status online.");
      } finally {
        setLoadingOnline(false);
      }
    })();
  }, [profileId, token]);

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
        await fetchJSON(`${API}/auth/profile/online`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_online: val }),
        });
      } catch (e: any) {
        setIsOnline(prev);
        Alert.alert("Gagal", e?.message || "Tidak dapat menyimpan status online.");
      } finally {
        setSavingOnline(false);
      }
    },
    [token, isOnline]
  );

  async function logout() {
    await SecureStore.deleteItemAsync("auth").catch(() => {});
    Alert.alert("Logout", "Anda telah keluar.", [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]);
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
            onValueChange={updateOnline}
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
    height: 56, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 12, marginTop: 10, flexDirection: "row", alignItems: "center",
  },
  rowText: { flex: 1, marginLeft: 10, fontWeight: "700", color: "#111827" },
  logout: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#FEE2E2", backgroundColor: "#FEF2F2",
    alignItems: "center", justifyContent: "center", flexDirection: "row", marginTop: 18,
  },
});
