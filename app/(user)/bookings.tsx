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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";

/* ================= Types ================= */
type Booking = {
  id: number;
  offering_id?: number | null;
  booking_date?: string;   // ISO date or datetime
  booking_time?: string;   // "HH:MM"
  status?: string;
  mua_id?: string;
  offering?: { name_offer?: string } | null;
  name_offer?: string;     // fallback if API flattens
  amount?: string | number;
  grand_total?: string | number;
  invoice_number?: string;
};

type MuaLoc = {
  id: string;
  name: string;
  address?: string;
};

/* ================= Consts ================= */
const API_BASE = "https://smstudio.my.id/api";
const API_BOOKINGS = `${API_BASE}/bookings`;     // role & filter dilakukan di sisi klien jika perlu
const API_MUA_LOC = `${API_BASE}/mua-location`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";
const CARD_BG = "#F7F0FF";

/* ================= Helpers ================= */
function parseDateTime(book: Booking): Date | null {
  const d = book.booking_date;
  const t = book.booking_time;
  if (!d && !t) return null;

  // booking_date bisa ISO lengkap; jika ada time terpisah, gabungkan
  let iso = d || "";
  if (d && t && !d.includes("T")) iso = `${d} ${t}`;
  const dt = new Date(iso);
  if (isNaN(+dt) && t) {
    // fallback jika d hanya "YYYY-MM-DD"
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

  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Booking[]>([]);
  const [muaMap, setMuaMap] = useState<Record<string, MuaLoc>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  // ambil token dari SecureStore
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
        }
      } catch {}
    })();
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Ambil bookings user (server idealnya filter by user; jika tidak, backend kirim hanya milik user via token)
      const [bRes, mRes] = await Promise.all([
        fetch(API_BOOKINGS, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        fetch(API_MUA_LOC),
      ]);

      const bJson = await bRes.json();
      const mJson = await mRes.json();

      const items: Booking[] = (bJson?.data ?? bJson ?? []) as Booking[];
      const actives = items.filter((b) =>
        ["pending", "confirmed"].includes((b.status || "").toLowerCase())
      );

      const list: MuaLoc[] = mJson?.data ?? mJson ?? [];
      const map: Record<string, MuaLoc> = {};
      for (const it of list) map[it.id] = it;

      setRows(actives);
      setMuaMap(map);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // search filter
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
    const title =
      item.offering?.name_offer ||
      item.name_offer ||
      "Paket";
    const vendor = (item.mua_id && muaMap[item.mua_id]?.name) || "SM Studio";
    const when = fmtHuman(parseDateTime(item));

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(user)/bookings/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.vendor}>{vendor}</Text>
          <TouchableOpacity
            style={styles.detailBtn}
            onPress={() => router.push(`/(user)/bookings/${item.id}`)}
          >
            <Text style={{ color: "#9D61C5", fontWeight: "800" }}>Detail</Text>
          </TouchableOpacity>
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
          placeholder="Search"
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={{ color: TEXT_MUTED, marginTop: 24, textAlign: "center" }}>
              Belum ada pesanan aktif.
            </Text>
          }
        />
      )}
    </View>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.select({ ios: 12, android: 8 }) },
  title: { fontSize: 28, fontWeight: "800", marginHorizontal: 16, marginBottom: 12, color: "#111827" },

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
  detailBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#EEE3FA",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
