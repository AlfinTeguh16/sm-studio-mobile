// app/(mua)/tabs/booking.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../../../../lib/api"; // sesuaikan path jika perlu

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";

type BookingApi = any;

type Row = {
  id: number | string;
  title: string;
  date: string;
  time: string;
  customer?: string;
  status?: string | null;
  job_status?: string | null;
};

function pillColor(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (["completed"].includes(s)) return { fg: "#166534", bg: "#DCFCE7", bd: "#86EFAC" };
  if (["confirmed", "in_progress"].includes(s)) return { fg: "#1D4ED8", bg: "#DBEAFE", bd: "#93C5FD" };
  if (["pending"].includes(s)) return { fg: "#92400E", bg: "#FEF3C7", bd: "#FCD34D" };
  if (["rejected", "cancelled"].includes(s)) return { fg: "#B91C1C", bg: "#FEE2E2", bd: "#FCA5A5" };
  return { fg: "#374151", bg: "#F3F4F6", bd: "#E5E7EB" };
}

function StatusPill({ label }: { label?: string | null }) {
  const { fg, bg, bd } = pillColor(label);
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={{ color: fg, fontWeight: "800", fontSize: 12 }}>
        {(label || "-").toUpperCase()}
      </Text>
    </View>
  );
}

export default function MuaBookingsAccepted() {
  const router = useRouter();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [role, setRole] = useState<"mua" | "customer" | "admin" | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // 1) ambil profile & role dari SecureStore jika ada
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth").catch(() => null);
        if (raw) {
          const auth = JSON.parse(raw);
          if (!alive) return;
          setProfileId(auth?.profile?.id || auth?.user?.profile?.id || null);
          setRole(auth?.profile?.role || auth?.user?.role || null);
        }
      } catch (err) {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2) fallback: jika profileId/role belum ada, panggil api.me()
  useEffect(() => {
    let alive = true;
    (async () => {
      if (profileId && role) return;
      try {
        const me = await api.me();
        if (!alive) return;
        setProfileId(me?.profile?.id || me?.id || null);
        setRole(me?.profile?.role || me?.role || null);
      } catch (err) {
        // jika me() gagal, tetap lanjut dan tampilkan pesan kosong nanti
        console.warn("api.me() failed:", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileId, role]);

  const fetchBookings = useCallback(async () => {
    if (!profileId || !role) return;
    setLoading(true);
    setErrorText(null);
    try {
      const params: any = { per_page: 50, status: "confirmed" };
      if (role === "mua") params.mua_id = profileId;
      else params.customer_id = profileId;

      const res = await api.bookings.list(params);
      // res might be paginated: { data: [...] } or just array
      const list: BookingApi[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : res?.data ?? [];

      const mapped: Row[] = list.map((b: any) => ({
        id: b.id,
        title: b?.offering?.name_offer || b?.title || "Booking",
        date: (b.booking_date || b?.date || "").slice(0, 10),
        time: b.booking_time || b?.time || "--:--",
        customer: b?.customer?.name || b?.customer_name || undefined,
        status: b?.status ?? null,
        job_status: b?.job_status ?? null,
      }));

      setRows(mapped);
    } catch (err: any) {
      console.error("fetchBookings error:", err);
      setRows([]);
      setErrorText(err?.message || "Gagal memuat booking.");
    } finally {
      setLoading(false);
    }
  }, [profileId, role]);

  useEffect(() => {
    if (profileId && role) fetchBookings();
  }, [profileId, role, fetchBookings]);

  useFocusEffect(
    useCallback(() => {
      // refresh ringan saat screen fokus (misal setelah create/edit)
      if (profileId && role) fetchBookings();
    }, [profileId, role, fetchBookings])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchBookings();
    } finally {
      setRefreshing(false);
    }
  }, [fetchBookings]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Bookings Diterima</Text>

      {errorText ? (
        <View style={styles.center}>
          <Text style={{ color: "crimson", textAlign: "center", paddingHorizontal: 16 }}>
            {errorText}
          </Text>
          <TouchableOpacity style={[styles.addBtn, { marginTop: 12 }]} onPress={fetchBookings}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 6 }}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/(mua)/bookings/[id]",
                  params: { id: String(item.id) },
                })
              }
              style={styles.card}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>
                  {item.date} • {item.time}
                </Text>
                {item.customer ? <Text style={styles.meta}>Customer: {item.customer}</Text> : null}

                <View style={{ flexDirection: "row", marginTop: 8, flexWrap: "wrap" }}>
                  {item.status ? (
                    <View style={{ marginRight: 8 }}>
                      <StatusPill label={item.status} />
                    </View>
                  ) : null}
                  {item.job_status ? (
                    <View style={{ marginRight: 8 }}>
                      <StatusPill label={item.job_status} />
                    </View>
                  ) : null}
                </View>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: "#6B7280", padding: 16 }}>Belum ada booking diterima.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "800", margin: 16, color: "#111827" },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: { fontWeight: "800", color: "#111827" },
  meta: { color: "#6B7280", marginTop: 4 },
  pill: {
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
  },
});
