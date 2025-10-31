import React, { useEffect, useMemo, useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView, 
  Alert, 
  Platform 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import authStorage from "../../../utils/authStorage"; // ✅ GUNAKAN AUTH STORAGE YANG SAMA

const API = "https://smstudio.my.id/api";
const API_SHOW = (id: string|number)=> `${API}/notifications/${id}`;
const API_READ = (id: string|number)=> `${API}/notifications/${id}/read`;
const API_DEL = (id: string|number)=> `${API}/notifications/${id}`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const TEXT = "#111827";
const CARD_BG = "#F7F2FA";

type Notif = {
  id: string|number;
  user_id: string;
  title: string;
  message: string;
  type: "booking"|"system"|"payment"|string;
  is_read: boolean;
  created_at?: string;
  [k: string]: any;
};

/* ---------------- helpers ---------------- */
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

const fmtTime = (iso?: string)=> {
  if(!iso) return "-";
  const d = new Date(iso);
  if(!Number.isFinite(+d)) return iso;
  return d.toLocaleString("id-ID",{ 
    weekday:"long", 
    day:"2-digit", 
    month:"long", 
    year:"numeric", 
    hour:"2-digit", 
    minute:"2-digit" 
  });
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

/* ---------------- component ---------------- */
export default function NotifDetail(){
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<Notif|null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadNotification = async () => {
    if (!id) {
      setLoading(false);
      Alert.alert("Oops", "ID tidak valid.");
      return;
    }

    try {
      setLoading(true);
      const json = await fetchJSON(API_SHOW(id));
      const data: Notif = (json?.data ?? json) as Notif;
      setItem(data);

      // auto mark read jika belum
      if(data && !data.is_read){
        try {
          await fetchJSON(API_READ(id), { 
            method: "PATCH",
            body: JSON.stringify({ is_read: true })
          });
          setItem(prev => prev ? { ...prev, is_read: true } : prev);
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
  };

  useEffect(() => {
    loadNotification();
  }, [id]);

  const color = useMemo(()=>{
    const t = item?.type;
    return t === "booking" ? "#0EA5E9" : t === "payment" ? "#10B981" : "#A78BFA";
  },[item?.type]);

  const onDelete = async () => {
    if(!id) return;
    
    Alert.alert(
      "Hapus Notifikasi",
      "Apakah Anda yakin ingin menghapus notifikasi ini?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              setWorking(true);
              await fetchJSON(API_DEL(id), { method: "DELETE" });
              Alert.alert("Berhasil", "Notifikasi dihapus", [
                { text: "OK", onPress: () => router.back() }
              ]);
            } catch (e: any) {
              console.error("[NotifDetail] Delete error:", e);
              if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
                Alert.alert("Oops", e?.message || "Gagal menghapus");
              }
            } finally { 
              setWorking(false); 
            }
          }
        },
      ]
    );
  };

  const onToggleRead = async () => {
    if (!item) return;
    
    try {
      setWorking(true);
      const newReadStatus = !item.is_read;
      await fetchJSON(API_READ(item.id), { 
        method: "PATCH",
        body: JSON.stringify({ is_read: newReadStatus })
      });
      setItem(prev => prev ? { ...prev, is_read: newReadStatus } : prev);
    } catch (e: any) {
      console.error("[NotifDetail] Toggle read error:", e);
      if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
        Alert.alert("Oops", e?.message || "Gagal mengubah status");
      }
    } finally {
      setWorking(false);
    }
  };

  if(loading){
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={{ color: MUTED, marginTop: 6 }}>Memuat…</Text>
      </View>
    );
  }

  if(!item){
    return (
      <View style={styles.center}>
        <Text style={{ color: MUTED, marginBottom: 8 }}>Notifikasi tidak ditemukan.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadNotification}>
          <Ionicons name="refresh" size={16} color="#111" />
          <Text style={styles.retryBtnText}>Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.iconBtn} 
          onPress={() => router.back()}
          disabled={working}
        >
          <Ionicons name="arrow-back" size={18} color={TEXT}/>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle} numberOfLines={1}>
          Detail Notifikasi
        </Text>
        
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={onToggleRead} 
            disabled={working}
          >
            <Ionicons 
              name={item.is_read ? "mail-open-outline" : "mail-unread-outline"} 
              size={18} 
              color={item.is_read ? MUTED : PURPLE} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.iconBtn, styles.deleteBtn]} 
            onPress={onDelete} 
            disabled={working}
          >
            {working ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#DC2626"/>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <Text style={{ color, fontWeight: "800", fontSize: 12 }}>
            {(item.type || "system").toUpperCase()}
          </Text>
        </View>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.time}>{fmtTime(item.created_at)}</Text>

        <View style={styles.box}>
          <Text style={styles.msg}>{item.message}</Text>
        </View>

        {/* Status Info */}
        <View style={[
          styles.info, 
          { 
            backgroundColor: item.is_read ? "#F0FDF4" : "#FFF7ED", 
            borderColor: item.is_read ? "#BBF7D0" : "#FED7AA" 
          }
        ]}>
          <Ionicons 
            name={item.is_read ? "checkmark-circle-outline" : "alert-circle-outline"} 
            size={18} 
            color={item.is_read ? "#16A34A" : "#EA580C"}
          />
          <Text style={{ 
            color: item.is_read ? "#16A34A" : "#EA580C", 
            marginLeft: 6, 
            flex: 1 
          }}>
            {item.is_read ? "Sudah dibaca" : "Belum dibaca"}
          </Text>
        </View>

        {/* Additional Info */}
        <View style={styles.metaContainer}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>ID Notifikasi:</Text>
            <Text style={styles.metaValue}>{item.id}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Tipe:</Text>
            <Text style={styles.metaValue}>{item.type}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

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
  
  header: { 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { 
    fontWeight: "800", 
    fontSize: 18, 
    color: TEXT, 
    maxWidth: 200, 
    textAlign: "center" 
  },
  iconBtn: { 
    height: 38, 
    width: 38,
    borderWidth: 1, 
    borderColor: BORDER, 
    borderRadius: 10, 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: "#fff" 
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
    borderRadius: 6, 
    paddingVertical: 6, 
    paddingHorizontal: 10, 
    marginBottom: 12 
  },
  title: { 
    fontSize: 20, 
    fontWeight: "800", 
    color: TEXT,
    lineHeight: 28,
    marginBottom: 4
  },
  time: { 
    color: MUTED, 
    marginBottom: 16,
    fontSize: 14
  },

  box: { 
    padding: 16, 
    borderRadius: 12, 
    backgroundColor: CARD_BG, 
    borderWidth: 1, 
    borderColor: "#E9DDF7",
    marginBottom: 16
  },
  msg: { 
    color: TEXT, 
    lineHeight: 20,
    fontSize: 15
  },

  info: { 
    padding: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    flexDirection: "row", 
    alignItems: "center",
    marginBottom: 16
  },

  metaContainer: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  metaLabel: {
    color: MUTED,
    fontSize: 14,
    fontWeight: "500",
  },
  metaValue: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
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