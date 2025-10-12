import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

/* ================== API ================== */
const API = "https://smstudio.my.id/api";
const API_SHOW = (id: string | number) => `${API}/notifications/${id}`;
const API_READ = (id: string | number) => `${API}/notifications/${id}/read`;
const API_DEL = (id: string | number) => `${API}/notifications/${id}`;

/* ================== UI CONST ================== */
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const TEXT = "#111827";
const CARD_BG = "#F7F2FA";

/* ================== Types ================== */
type Notif = {
  id: string | number;
  user_id: string;
  title?: string;
  message?: string;
  type?: "booking" | "system" | "payment" | string; // bisa undefined dari server
  is_read: boolean;
  created_at?: string;
  updated_at?: string;
};

/* ================== Helpers ================== */
async function getToken(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync("auth");
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j?.token || null;
  } catch {
    return null;
  }
}
const fmtTime = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isFinite(+d)
    ? d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : iso;
};
// Normalisasi type supaya tidak undefined
const safeType = (t?: string) => (t && typeof t === "string" ? t : "system");
const typeColor = (t?: string) => {
  const st = safeType(t);
  if (st === "booking") return "#0EA5E9";
  if (st === "payment") return "#10B981";
  return "#A78BFA"; // system / unknown
};

/* ================== Screen ================== */
export default function NotifDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [token, setToken] = useState<string | null>(null);
  const [item, setItem] = useState<Notif | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // token
  useEffect(() => {
    (async () => setToken(await getToken()))();
  }, []);

  const headers = useMemo(
    () => ({
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      Alert.alert("Oops", "ID tidak valid.");
      return;
    }
    try {
      setLoading(true);
      const res: Response = await fetch(API_SHOW(id), { headers, cache: "no-store" });
      const txt = await res.text();
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          msg = JSON.parse(txt)?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      const json = JSON.parse(txt);
      const data: Notif = json?.data ?? json;
      setItem(data);
      // otomatis tandai telah dibaca
      if (data && !data.is_read) {
        try {
          await fetch(API_READ(data.id), {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ is_read: true }),
          });
          setItem((prev) => (prev ? { ...prev, is_read: true } : prev));
        } catch {}
      }
    } catch (e: any) {
      Alert.alert("Oops", e?.message || "Gagal memuat notifikasi");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id, headers]);

  useEffect(() => {
    if (!token) return; // tunggu token (kalau endpoint butuh auth)
    load();
  }, [token, load]);

  const doToggleRead = async () => {
    if (!item) return;
    try {
      setBusy(true);
      await fetch(API_READ(item.id), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: !item.is_read }),
      });
      setItem({ ...item, is_read: !item.is_read });
    } catch {}
    setBusy(false);
  };

  const doDelete = async () => {
    if (!item) return;
    Alert.alert("Hapus Notifikasi", "Yakin ingin menghapus notifikasi ini?", [
      { text: "Batal" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy(true);
            await fetch(API_DEL(item.id), { method: "DELETE", headers });
            router.back();
          } catch (e: any) {
            Alert.alert("Oops", e?.message || "Gagal menghapus");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ color: MUTED, marginTop: 6 }}>Memuat…</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={{ color: MUTED, marginBottom: 8 }}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.hBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color="#111" />
          <Text style={styles.hBtnText}>Muat Ulang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const t = safeType(item.type);
  const color = typeColor(t);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Detail Notifikasi
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={doToggleRead} disabled={busy}>
            <Ionicons name={item.is_read ? "mail-open-outline" : "mail-unread-outline"} size={18} color={TEXT} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={doDelete} disabled={busy}>
            <Ionicons name="trash-outline" size={18} color={TEXT} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
          {/* AMAN: t sudah string */}
          <Text style={{ color, fontWeight: "800" }}>{t.toUpperCase()}</Text>
        </View>

        <Text style={styles.title}>{item.title ?? "-"}</Text>
        <Text style={styles.time}>Dikirim: {fmtTime(item.created_at)}</Text>

        <View style={styles.box}>
          <Text style={styles.msg}>{item.message ?? "-"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ================== Styles ================== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },

  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 12, android: 8 }),
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: TEXT, maxWidth: 200, textAlign: "center" },
  iconBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  badgeType: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: "800", color: TEXT, marginBottom: 4 },
  time: { color: MUTED, marginBottom: 12 },
  box: { backgroundColor: CARD_BG, borderWidth: 1, borderColor: "#EDE9FE", borderRadius: 12, padding: 12 },
  msg: { color: TEXT, lineHeight: 20 },

  hBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  hBtnText: { color: "#111827", fontWeight: "700" },
});
