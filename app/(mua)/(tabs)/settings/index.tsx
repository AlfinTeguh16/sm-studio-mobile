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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";

export default function MuaSettings() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [loadingOnline, setLoadingOnline] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  // --- Ambil token + profileId dari SecureStore, fallback ke /auth/me
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          setToken(auth?.token ?? null);
          setProfileId(auth?.profile?.id ?? auth?.user?.id ?? null);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (profileId && !token) {
      // token mungkin tetap null kalau app tidak mewajibkan login;
      // tetap bisa GET /mua/:id (public)
    }
    if (!profileId) return;

    (async () => {
      setLoadingOnline(true);
      try {
        const res = await fetch(`${API}/mua/${profileId}`);
        const json = await res.json();
        const data = json?.data ?? json;
        setIsOnline(!!data?.is_online);
      } catch (e: any) {
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
      setIsOnline(val); // optimistik
      setSavingOnline(true);
      try {
        const res = await fetch(`${API}/auth/profile/online`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_online: val }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.message || "Gagal memperbarui status.");
        }
      } catch (e: any) {
        setIsOnline(prev); // revert
        Alert.alert("Gagal", e?.message || "Tidak dapat menyimpan status online.");
      } finally {
        setSavingOnline(false);
      }
    },
    [token, isOnline]
  );

  async function logout() {
    await SecureStore.deleteItemAsync("auth").catch(() => {});
    Alert.alert("Logout", "Anda telah keluar.", [
      { text: "OK", onPress: () => router.replace("/(auth)/login") },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Settings</Text>

      {/* Edit Profile */}
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push("/(user)/profile")}
      >
        <Ionicons name="person-circle-outline" size={20} color="#111827" />
        <Text style={styles.rowText}>Edit Profile</Text>
        <Ionicons name="chevron-forward" size={16} color="#6B7280" />
      </TouchableOpacity>

     

      {/* Status Online/Offline */}
      <View style={styles.row}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Ionicons
            name={isOnline ? "wifi" : "wifi-outline"}
            size={20}
            color={isOnline ? PURPLE : "#111827"}
          />
          <Text style={styles.rowText}>
            Status: {isOnline ? "Online" : "Offline"}
          </Text>
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

      {/* Logout */}
      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={{ color: "#DC2626", fontWeight: "800", marginLeft: 8 }}>
          Logout
        </Text>
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
