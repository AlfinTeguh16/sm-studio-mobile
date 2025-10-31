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
import authStorage from "../../../utils/authStorage";

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
  type?: "booking" | "system" | "payment" | string;
  is_read: boolean;
  created_at?: string;
  updated_at?: string;
  [k: string]: any;
};

/* ================== Helpers ================== */
async function getAuthHeaders() {
  try {
    const token = await authStorage.getAuthToken();
    const headers: Record<string, string> = { 
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  } catch (error) {
    console.warn("[getAuthHeaders] Error:", error);
    return { Accept: "application/json" };
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

/** Safe fetch dengan debug info */
async function fetchJSON(url: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const fullOptions = {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  };

  console.log(`[fetchJSON] ${options.method || 'GET'} ${url}`, {
    headers: fullOptions.headers,
    body: fullOptions.body
  });

  const res = await fetch(url, fullOptions);
  const text = await res.text();

  console.log(`[fetchJSON] Response ${res.status}:`, text.substring(0, 200));

  // Handle unauthorized
  if (res.status === 401) {
    await authStorage.clearAuthAll();
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      errorMsg = json?.message || json?.error || errorMsg;
    } catch {
      errorMsg = text.substring(0, 100) || errorMsg;
    }
    throw new Error(errorMsg);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response");
  }
}

/* ================== Screen ================== */
export default function NotifDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [item, setItem] = useState<Notif | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      Alert.alert("Oops", "ID tidak valid.");
      return;
    }
    
    try {
      setLoading(true);
      const json = await fetchJSON(API_SHOW(id));
      const data: Notif = json?.data ?? json;
      setItem(data);
      
      // otomatis tandai telah dibaca
      if (data && !data.is_read) {
        try {
          await fetchJSON(API_READ(data.id), {
            method: "PATCH",
            body: JSON.stringify({ is_read: true }),
          });
          setItem((prev) => (prev ? { ...prev, is_read: true } : prev));
        } catch (readError) {
          console.warn("[NotifDetail] Auto mark read failed:", readError);
        }
      }
    } catch (e: any) {
      console.error("[NotifDetail] Load error:", e);
      if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
        Alert.alert("Oops", e?.message || "Gagal memuat notifikasi");
      }
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const doToggleRead = async () => {
    if (!item) return;
    try {
      setBusy(true);
      await fetchJSON(API_READ(item.id), {
        method: "PATCH",
        body: JSON.stringify({ is_read: !item.is_read }),
      });
      setItem({ ...item, is_read: !item.is_read });
    } catch (e: any) {
      console.error("[doToggleRead] Error:", e);
      if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
        Alert.alert("Error", "Gagal mengubah status notifikasi");
      }
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!item) return;
    Alert.alert("Hapus Notifikasi", "Yakin ingin menghapus notifikasi ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy(true);
            await fetchJSON(API_DEL(item.id), { 
              method: "DELETE"
            });
            router.back();
          } catch (e: any) {
            console.error("[doDelete] Error:", e);
            if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
              Alert.alert("Oops", e?.message || "Gagal menghapus");
            }
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
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={styles.loadingText}>Memuat…</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Data tidak ditemukan.</Text>
        <TouchableOpacity 
          style={styles.retryBtn} 
          onPress={load}
          disabled={busy}
        >
          <Ionicons name="refresh" size={16} color="#111" />
          <Text style={styles.retryBtnText}>Muat Ulang</Text>
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
        <TouchableOpacity 
          style={styles.iconBtn} 
          onPress={() => router.back()}
          disabled={busy}
        >
          <Ionicons name="arrow-back" size={18} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Detail Notifikasi
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={doToggleRead} 
            disabled={busy}
          >
            <Ionicons 
              name={item.is_read ? "mail-open-outline" : "mail-unread-outline"} 
              size={18} 
              color={item.is_read ? MUTED : PURPLE} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.iconBtn, styles.deleteBtn]} 
            onPress={doDelete} 
            disabled={busy}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <Text style={[styles.badgeText, { color }]}>
            {t.toUpperCase()}
          </Text>
        </View>

        <Text style={styles.title}>{item.title ?? "-"}</Text>
        <Text style={styles.time}>Dikirim: {fmtTime(item.created_at)}</Text>

        <View style={styles.box}>
          <Text style={styles.msg}>{item.message ?? "-"}</Text>
        </View>
        
        {/* Status indicator */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { 
            backgroundColor: item.is_read ? "#10B981" : "#EF4444" 
          }]} />
          <Text style={styles.statusText}>
            {item.is_read ? "Sudah dibaca" : "Belum dibaca"}
          </Text>
        </View>

        {/* Additional Metadata */}
        <View style={styles.metaContainer}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>ID Notifikasi:</Text>
            <Text style={styles.metaValue}>{item.id}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Tipe:</Text>
            <Text style={styles.metaValue}>{t}</Text>
          </View>
          {item.updated_at && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Diupdate:</Text>
              <Text style={styles.metaValue}>{fmtTime(item.updated_at)}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/* ================== Styles ================== */
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#fff",
    paddingTop: Platform.select({ ios: 12, android: 8 })
  },
  center: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: "#fff" 
  },
  loadingText: {
    color: MUTED, 
    marginTop: 12,
    fontSize: 14
  },
  errorText: {
    color: MUTED, 
    marginBottom: 12,
    fontSize: 14
  },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: "800", 
    color: TEXT, 
    maxWidth: 200, 
    textAlign: "center" 
  },
  headerActions: {
    flexDirection: "row", 
    gap: 8
  },
  iconBtn: {
    height: 38,
    width: 38,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  deleteBtn: {
    backgroundColor: "#FEE2E2", 
    borderColor: "#FCA5A5"
  },

  content: { 
    padding: 16, 
    paddingBottom: 24 
  },

  badgeType: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  badgeText: {
    fontWeight: "800", 
    fontSize: 12
  },
  title: { 
    fontSize: 20, 
    fontWeight: "800", 
    color: TEXT, 
    marginBottom: 4,
    lineHeight: 28 
  },
  time: { 
    color: MUTED, 
    marginBottom: 16,
    fontSize: 14 
  },
  box: { 
    backgroundColor: CARD_BG, 
    borderWidth: 1, 
    borderColor: "#EDE9FE", 
    borderRadius: 12, 
    padding: 16,
    marginBottom: 16 
  },
  msg: { 
    color: TEXT, 
    lineHeight: 20,
    fontSize: 15 
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },

  metaContainer: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaLabel: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '500',
  },
  metaValue: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '600',
  },

  retryBtn: {
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
  retryBtnText: { 
    color: "#111827", 
    fontWeight: "700",
    fontSize: 14 
  },
});