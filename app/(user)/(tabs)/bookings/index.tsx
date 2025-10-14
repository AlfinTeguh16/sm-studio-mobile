// app/(user)/(tabs)/booking/index.tsx
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
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";

/* ================= Types ================= */
type Booking = {
  id: number | string;
  offering_id?: number | string | null;
  booking_date?: string;   // ISO date or datetime
  booking_time?: string;   // "HH:MM"
  status?: string;
  mua_id?: string;
  offering?: { name_offer?: string } | null;
  name_offer?: string;     // fallback jika API flatten
  amount?: string | number;
  grand_total?: string | number;
  invoice_number?: string;
  customer_id?: string | number; // <-- penting untuk filter milik user
};

type MuaLoc = {
  id: string;
  name: string;
  address?: string;
};

/* ================= Consts ================= */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_BOOKINGS = `${API_BASE}/bookings`; // server boleh sudah filter by auth user
const API_MUA_LOC = `${API_BASE}/mua-location`;
const API_ME = `${API_BASE}/me`;             // untuk ambil id user kalau belum tersimpan

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";
const CARD_BG = "#F7F0FF";

/* ================= Helpers ================= */
type HeaderMap = Record<string, string>;

async function getAuthToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync("auth");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

async function getAuthHeaders(): Promise<HeaderMap> {
  const token = await getAuthToken();
  const h: HeaderMap = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// Ambil me.id dari secure store; fallback panggil /api/me
async function getMeId(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync("auth");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const candidate =
        parsed?.user?.id ?? parsed?.profile?.id ?? parsed?.id ?? null;
      if (candidate) return String(candidate);
    } catch {}
  }
  try {
    const headers = await getAuthHeaders();
    const me = await safeFetchJSON<any>(API_ME, { headers });
    const id = me?.id ?? me?.user?.id ?? me?.profile?.id ?? null;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

async function safeFetchJSON<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  // gabungkan headers
  const given = (init.headers || {}) as HeaderMap;
  const headers: HeadersInit = { ...given, Accept: "application/json" };

  const res = await fetch(url, {
    method: init.method ?? "GET",
    cache: "no-store",
    ...init,
    headers,
  });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) throw new Error("401_UNAUTH");
    throw new Error(`HTTP ${res.status} (ct=${ct}) — ${text.slice(0, 160)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected non-JSON (ct=${ct}) — ${text.slice(0, 160)}`);
  }
}

function parseDateTime(book: Booking): Date | null {
  const d = book.booking_date;
  const t = book.booking_time;
  if (!d && !t) return null;

  let iso = d || "";
  if (d && t && !d.includes("T")) iso = `${d} ${t}`;
  const dt = new Date(iso);
  if (isNaN(+dt) && t) {
    const parts = (d || "").split("-");
    if (parts.length === 3) {
      const [y, m, dd] = parts.map(Number);
      const [hh, mm] = t.split(":").map(Number);
      const alt = new Date(y, (m || 1) - 1, dd, hh || 0, mm || 0);
      return isNaN(+alt) ? null : alt;
    }
  }
  return isNaN(+dt) ? null : dt;
}

function fmtHuman(dt: Date | null): string {
  if (!dt) return "-";
  const jam = dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const tgl = dt.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  return `${jam} - ${tgl}`;
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
      const headers = await getAuthHeaders();

      // 1) Ambil ID user yang login
      const meId = await getMeId();

      // 2) Ambil bookings + peta MUA (sekali jalan)
      const [bJson, mJson] = await Promise.all([
        safeFetchJSON<{ data?: Booking[] } | Booking[]>(API_BOOKINGS, { headers }),
        safeFetchJSON<{ data?: MuaLoc[] } | MuaLoc[]>(API_MUA_LOC, { headers }),
      ]);

      const items: Booking[] = (bJson as any)?.data ?? (bJson as Booking[]) ?? [];

      // 3) Filter HANYA booking milik user
      const mine = meId
        ? items.filter((b) => {
            const cid = b.customer_id != null ? String(b.customer_id) : null;
            // jika API belum mengirim customer_id, kita **skip** (anggap bukan milik user)
            return cid ? cid === meId : false;
          })
        : []; // jika tidak dapat meId, aman default kosong

      // 4) (opsional) Urutkan terbaru dulu
      mine.sort((a, b) => {
        const da = parseDateTime(a);
        const db = parseDateTime(b);
        const ta = da ? +da : 0;
        const tb = db ? +db : 0;
        return tb - ta; // desc
      });

      // 5) Peta MUA
      const list: MuaLoc[] = (mJson as any)?.data ?? (mJson as MuaLoc[]) ?? [];
      const map: Record<string, MuaLoc> = {};
      for (const it of list) map[it.id] = it;

      setRows(mine);
      setMuaMap(map);
    } catch (e: any) {
      if (e?.message === "401_UNAUTH") {
        Alert.alert("Sesi berakhir", "Silakan login kembali.");
        await SecureStore.deleteItemAsync("auth").catch(() => {});
        router.replace("/(auth)/login");
      } else {
        // bisa console.log(e) saat dev
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
    if (!q) return rows;
    return rows.filter((b) => {
      const title =
        b.offering?.name_offer ||
        b.name_offer ||
        `Pemesanan #${b.id}` ||
        "";
      const vendor = (b.mua_id && muaMap[b.mua_id]?.name) || "";
      return title.toLowerCase().includes(q) || vendor.toLowerCase().includes(q);
    });
  }, [rows, query, muaMap]);

  const renderItem = ({ item }: { item: Booking }) => {
    const title = item.offering?.name_offer || item.name_offer || "Paket";
    const vendor = (item.mua_id && muaMap[item.mua_id]?.name) || "SM Studio";
    const when = fmtHuman(parseDateTime(item));
    const status = (item.status || "").toUpperCase();

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(user)/bookings/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.vendor} numberOfLines={1}>{vendor}</Text>

          <View style={styles.rowMeta}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{status || "STATUS"}</Text>
            </View>
            <TouchableOpacity
              style={styles.detailBtn}
              onPress={() => router.push(`/(user)/bookings/${item.id}`)}
            >
              <Text style={{ color: "#9D61C5", fontWeight: "800" }}>Detail</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.when} numberOfLines={2}>{when}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Pesanan Anda</Text>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Cari pesanan..."
          placeholderTextColor={TEXT_MUTED}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        <Ionicons name="search" size={16} color={TEXT_MUTED} style={{ marginRight: 10 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={{ color: TEXT_MUTED, marginTop: 24, textAlign: "center" }}>
              Belum ada pesanan.
            </Text>
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
  searchInput: { flex: 1, paddingHorizontal: 12, color: "#111" },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#E9DDF7",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  vendor: { marginTop: 4, color: TEXT_MUTED },
  when: { marginLeft: 12, color: "#111827", textAlign: "right", width: 160 },
  rowMeta: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    backgroundColor: "#EBD8FF",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { color: "#6D3FA8", fontWeight: "700", fontSize: 12 },
  detailBtn: {
    marginLeft: 6,
    backgroundColor: "#EEE3FA",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
