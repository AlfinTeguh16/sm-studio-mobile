import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import authStorage from "../../../../utils/authStorage"; // ✅ GUNAKAN AUTH STORAGE YANG SAMA

/* ================= Types ================= */
type Booking = {
  id: number | string;
  offering_id?: number | string | null;
  booking_date?: string;   // "YYYY-MM-DD" atau ISO datetime
  booking_time?: string;   // "HH:mm" atau "HH:mm:ss"
  status?: string;
  mua_id?: string;
  offering?: { name_offer?: string } | null;
  name_offer?: string;     // fallback jika API flatten
  amount?: string | number;
  grand_total?: string | number;
  invoice_number?: string;
  customer_id?: string | number; // penting untuk filter milik user
};

type MuaLoc = {
  id: string;
  name: string;
  address?: string;
};

/* ================= Consts ================= */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_BOOKINGS = `${API_BASE}/bookings`;
const API_MUA_LOC = `${API_BASE}/mua-location`;
const API_ME = `${API_BASE}/me`;

const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";
const CARD_BG = "#F7F0FF";
const PURPLE = "#AA60C8";

/* ================= Helpers ================= */
type HeaderMap = Record<string, string>;

// ✅ GUNAKAN AUTH STORAGE YANG SAMA
async function getAuthHeaders(): Promise<HeaderMap> {
  try {
    const token = await authStorage.getAuthToken();
    const h: HeaderMap = { 
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  } catch (error) {
    console.warn("[getAuthHeaders] Error:", error);
    return { Accept: "application/json" };
  }
}

// Ambil user ID dari auth storage
async function getMeId(): Promise<string | null> {
  try {
    const profile = await authStorage.getUserProfile();
    if (profile?.id) {
      return String(profile.id);
    }
    
    // Fallback: coba ambil dari API
    console.log("[getMeId] No profile ID, fetching from API...");
    const headers = await getAuthHeaders();
    const me = await safeFetchJSON<any>(API_ME, { headers });
    const id = me?.id ?? me?.user?.id ?? me?.profile?.id ?? null;
    
    if (id) {
      console.log("[getMeId] Got ID from API:", id);
      // Update profile dengan data yang didapat
      await authStorage.setUserProfile(me);
    }
    
    return id ? String(id) : null;
  } catch (error) {
    console.warn("[getMeId] Error getting user ID:", error);
    return null;
  }
}

async function safeFetchJSON<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  try {
    const given = (init.headers || {}) as HeaderMap;
    const headers: HeadersInit = { ...given, Accept: "application/json" };

    const res = await fetch(url, {
      method: init.method ?? "GET",
      cache: "no-store",
      ...init,
      headers,
    });

    const text = await res.text();

    if (!res.ok) {
      if (res.status === 401) {
        console.log("[safeFetchJSON] 401 Unauthorized - Clearing auth");
        await authStorage.clearAuthAll();
        throw new Error("401_UNAUTH");
      }
      throw new Error(`HTTP ${res.status} — ${text.slice(0, 160)}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Unexpected non-JSON — ${text.slice(0, 160)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "401_UNAUTH") {
      throw error;
    }
    console.warn("[safeFetchJSON] Network error:", error);
    throw new Error("Network error: " + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Formatter aman untuk menampilkan "jam - tanggal"
 */
function fmtWhen(book: Booking): string {
  // 1) Ambil HH:mm aman dari string booking_time
  let hhmm = "-";
  if (typeof book.booking_time === "string" && book.booking_time.trim()) {
    const t = book.booking_time.trim();
    hhmm = t.length >= 5 ? t.slice(0, 5) : t;
  }

  // 2) Format tanggal (kalau ada)
  let tanggal = "-";
  if (typeof book.booking_date === "string" && book.booking_date.trim()) {
    const dstr = book.booking_date.trim();

    // Case A: booking_date ISO (mengandung 'T' atau jam)
    const looksLikeISO = /T|\d{2}:\d{2}/.test(dstr);
    if (looksLikeISO) {
      const dt = new Date(dstr.replace(" ", "T"));
      if (!isNaN(+dt)) {
        try {
          tanggal = new Intl.DateTimeFormat("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Makassar",
          }).format(dt);
          // jika booking_time kosong tapi ISO punya waktu → ambil dari ISO
          if (hhmm === "-" && /\d{2}:\d{2}/.test(dstr)) {
            const m = dstr.match(/(\d{2}:\d{2})/);
            if (m) hhmm = m[1];
          }
        } catch {
          tanggal = dstr.split("T")[0] || dstr.split(" ")[0] || dstr;
        }
      } else {
        tanggal = dstr.split("T")[0] || dstr.split(" ")[0] || dstr;
      }
    } else {
      // Case B: hanya "YYYY-MM-DD"
      try {
        const [y, m, d] = dstr.split("-").map((v) => parseInt(v, 10));
        const dt = new Date(y, (m || 1) - 1, d || 1);
        tanggal = new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(dt);
      } catch {
        tanggal = dstr;
      }
    }
  }

  // 3) Gabungkan hasil
  if (hhmm !== "-" && tanggal !== "-") return `${hhmm} - ${tanggal}`;
  if (hhmm !== "-") return hhmm;
  if (tanggal !== "-") return tanggal;
  return "-";
}

// Format status dengan warna yang sesuai
function getStatusStyle(status: string) {
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('pending') || statusLower.includes('menunggu')) {
    return { backgroundColor: '#FEF3C7', color: '#92400E' }; // yellow
  } else if (statusLower.includes('confirmed') || statusLower.includes('dikonfirmasi')) {
    return { backgroundColor: '#D1FAE5', color: '#065F46' }; // green
  } else if (statusLower.includes('cancel') || statusLower.includes('dibatalkan')) {
    return { backgroundColor: '#FEE2E2', color: '#991B1B' }; // red
  } else if (statusLower.includes('completed') || statusLower.includes('selesai')) {
    return { backgroundColor: '#E0E7FF', color: '#3730A3' }; // blue
  } else {
    return { backgroundColor: '#F3F4F6', color: '#6B7280' }; // gray
  }
}

/* ================= Screen ================= */
export default function ActiveBookingsScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<Booking[]>([]);
  const [muaMap, setMuaMap] = useState<Record<string, MuaLoc>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      console.log("[BookingsScreen] Fetching bookings data...");
      const headers = await getAuthHeaders();

      // 1) Ambil ID user yang login
      const meId = await getMeId();
      console.log("[BookingsScreen] User ID:", meId);

      // 2) Ambil bookings + peta MUA
      const [bJson, mJson] = await Promise.all([
        safeFetchJSON<{ data?: Booking[] } | Booking[]>(API_BOOKINGS, { headers }),
        safeFetchJSON<{ data?: MuaLoc[] } | MuaLoc[]>(API_MUA_LOC, { headers }),
      ]);

      const items: Booking[] = (bJson as any)?.data ?? (bJson as Booking[]) ?? [];
      console.log(`[BookingsScreen] Loaded ${items.length} total bookings`);

      // 3) Filter HANYA booking milik user
      const mine = meId
        ? items.filter((b) => {
            const cid = b.customer_id != null ? String(b.customer_id) : null;
            const isMine = cid ? cid === meId : false;
            
            if (!isMine) {
              console.log(`[BookingsScreen] Filtered out booking:`, {
                bookingId: b.id,
                bookingCustomerId: cid,
                myId: meId,
                match: isMine
              });
            }
            
            return isMine;
          })
        : [];

      console.log(`[BookingsScreen] User has ${mine.length} bookings`);

      // 4) Urutkan terbaru dulu
      mine.sort((a, b) => {
        const da = (a.booking_date || "") + " " + (a.booking_time || "");
        const db = (b.booking_date || "") + " " + (b.booking_time || "");
        return db.localeCompare(da);
      });

      // 5) Peta MUA
      const list: MuaLoc[] = (mJson as any)?.data ?? (mJson as MuaLoc[]) ?? [];
      const map: Record<string, MuaLoc> = {};
      for (const it of list) map[it.id] = it;

      setRows(mine);
      setMuaMap(map);
      
      console.log("[BookingsScreen] Data loaded successfully");
    } catch (e: any) {
      console.error("[BookingsScreen] Error loading data:", e);
      
      if (e?.message === "401_UNAUTH") {
        Alert.alert("Sesi berakhir", "Silakan login kembali.", [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(auth)/login");
            }
          }
        ]);
      } else {
        Alert.alert("Error", "Gagal memuat data pesanan: " + (e.message || "Unknown error"));
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // search filter (judul paket / nama MUA)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      console.log(`[BookingsScreen] Showing all ${rows.length} bookings`);
      return rows;
    }
    
    const filteredList = rows.filter((b) => {
      const title =
        b.offering?.name_offer ||
        b.name_offer ||
        `Pemesanan #${b.id}` ||
        "";
      const vendor = (b.mua_id && muaMap[b.mua_id]?.name) || "";
      const invoice = b.invoice_number || "";
      
      return title.toLowerCase().includes(q) || 
             vendor.toLowerCase().includes(q) ||
             invoice.toLowerCase().includes(q);
    });
    
    console.log(`[BookingsScreen] Search "${q}" found ${filteredList.length} results`);
    return filteredList;
  }, [rows, query, muaMap]);

  const renderItem = ({ item }: { item: Booking }) => {
    const title = item.offering?.name_offer || item.name_offer || "Paket Makeup";
    const vendor = (item.mua_id && muaMap[item.mua_id]?.name) || "MUA";
    const when = fmtWhen(item);
    const status = (item.status || "pending").toLowerCase();
    const statusText = item.status || "Menunggu";
    const statusStyle = getStatusStyle(status);
    
    const invoice = item.invoice_number ? `#${item.invoice_number}` : `#${item.id}`;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(user)/bookings/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.invoice}>{invoice}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {statusText}
              </Text>
            </View>
          </View>
          
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.vendor} numberOfLines={1}>{vendor}</Text>

          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={14} color={TEXT_MUTED} />
            <Text style={styles.timeText}>{when}</Text>
          </View>

          {item.grand_total && (
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>Total: </Text>
              <Text style={styles.price}>
                IDR {Number(item.grand_total).toLocaleString("id-ID")}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.arrowContainer}>
          <Ionicons name="chevron-forward" size={20} color={PURPLE} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Pesanan Anda</Text>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={TEXT_MUTED} style={{ marginLeft: 12 }} />
        <TextInput
          placeholder="Cari pesanan, MUA, atau invoice..."
          placeholderTextColor={TEXT_MUTED}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={styles.loadingText}>Memuat pesanan...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={[PURPLE]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color={TEXT_MUTED} />
              <Text style={styles.emptyTitle}>Belum ada pesanan</Text>
              <Text style={styles.emptyText}>
                Pesanan Anda akan muncul di sini setelah melakukan booking
              </Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => router.push("/(user)/(tabs)/offerings")}
              >
                <Text style={styles.browseButtonText}>Jelajahi Layanan</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: Platform.select({ ios: 12, android: 8 }),
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginHorizontal: 16,
    marginBottom: 12,
    color: "#111827",
  },
  searchWrap: {
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { 
    flex: 1, 
    paddingHorizontal: 12, 
    color: "#111",
    fontSize: 16,
  },
  
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#E9DDF7",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  invoice: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: "800", 
    color: "#111827",
    marginBottom: 4,
  },
  vendor: { 
    color: TEXT_MUTED,
    fontSize: 14,
    marginBottom: 8,
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  timeText: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginLeft: 4,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceLabel: {
    color: TEXT_MUTED,
    fontSize: 12,
  },
  price: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  arrowContainer: {
    marginLeft: 12,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: TEXT_MUTED,
    fontSize: 16,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  browseButton: {
    backgroundColor: PURPLE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  browseButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});