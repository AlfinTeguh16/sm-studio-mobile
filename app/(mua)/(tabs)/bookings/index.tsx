import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const API = "https://smstudio.my.id/api";
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
  // warna dasar sederhana
  if (["completed"].includes(s)) return { fg: "#166534", bg: "#DCFCE7", bd: "#86EFAC" };   // hijau
  if (["confirmed", "in_progress"].includes(s)) return { fg: "#1D4ED8", bg: "#DBEAFE", bd: "#93C5FD" }; // biru
  if (["pending"].includes(s)) return { fg: "#92400E", bg: "#FEF3C7", bd: "#FCD34D" };     // kuning
  if (["rejected", "cancelled"].includes(s)) return { fg: "#B91C1C", bg: "#FEE2E2", bd: "#FCA5A5" };   // merah
  return { fg: "#374151", bg: "#F3F4F6", bd: "#E5E7EB" }; // netral
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
  const [token, setToken] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [role, setRole] = useState<"mua" | "customer" | "admin" | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // 1) Muat auth dari SecureStore & fallback ke /auth/me
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth").catch(() => null);
        if (raw) {
          const auth = JSON.parse(raw);
          if (alive) {
            setToken(auth?.token || null);
            setProfileId(auth?.profile?.id || auth?.user?.profile?.id || null);
            setRole(auth?.profile?.role || auth?.user?.role || null);
          }
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2) Jika data profil belum lengkap, panggil /auth/me pakai token
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) return;
      if (profileId && role) return; // sudah cukup
      try {
        const meRes = await fetch(`${API}/auth/me`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        const me = await meRes.json();
        if (!alive) return;
        setProfileId(me?.profile?.id || me?.id || null);
        setRole(me?.profile?.role || me?.role || null);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [token, profileId, role]);

  // 3) Ambil booking milik user login saja
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token || !profileId || !role) return;
      setLoading(true);

      try {
        const whoKey = role === "mua" ? "mua_id" : "customer_id";
        const url = `${API}/bookings?${whoKey}=${encodeURIComponent(profileId)}&status=confirmed&per_page=50`;

        const res = await fetch(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        const list: BookingApi[] = json?.data ?? json ?? [];

        const mapped: Row[] = list.map((b) => ({
          id: b.id,
          title: b?.offering?.name_offer || "Booking",
          date: (b.booking_date || "").slice(0, 10),
          time: b.booking_time || "--:--",
          customer: b?.customer?.name,
          status: b?.status ?? null,          // ← status utama
          job_status: b?.job_status ?? null,  // ← status pekerjaan
        }));

        if (!alive) return;
        setRows(mapped);
      } catch {
        if (!alive) return;
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, profileId, role]);

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
      <FlatList
        data={rows}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
              {item.customer ? (
                <Text style={styles.meta}>Customer: {item.customer}</Text>
              ) : null}

              {/* Badge status */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {item.status ? <StatusPill label={item.status} /> : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#6B7280", padding: 16 }}>
            Belum ada booking diterima.
          </Text>
        }
      />
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
});
