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
};

export default function MuaBookingsAccepted() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [muaId, setMuaId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const raw = await SecureStore.getItemAsync("auth").catch(() => null);
      if (raw) {
        const auth = JSON.parse(raw);
        setToken(auth?.token || null);
        setMuaId(auth?.profile?.id || auth?.user?.id || null);
      }
      if (!muaId) {
        try {
          const meRes = await fetch(`${API}/auth/me`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
          const me = await meRes.json();
          setMuaId(me?.profile?.id || me?.id || null);
        } catch {}
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!muaId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/bookings?muaId=${muaId}&status=confirmed&per_page=50`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await res.json();
        const list: BookingApi[] = json?.data ?? json ?? [];
        const mapped: Row[] = list.map((b) => ({
          id: b.id,
          title: b?.offering?.name_offer || "Booking",
          date: (b.booking_date || "").slice(0, 10),
          time: b.booking_time || "--:--",
          customer: b?.customer?.name,
        }));
        setRows(mapped);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [muaId]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>;
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
            onPress={() => router.push({ pathname: "/(user)/bookings/[id]", params: { id: String(item.id) } })}
            style={styles.card}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.meta}>{item.date} • {item.time}</Text>
              {item.customer ? <Text style={styles.meta}>Customer: {item.customer}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: "#6B7280", padding: 16 }}>Belum ada booking diterima.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "800", margin: 16, color: "#111827" },
  card: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    padding: 14, flexDirection: "row", alignItems: "center"
  },
  cardTitle: { fontWeight: "800", color: "#111827" },
  meta: { color: "#6B7280", marginTop: 4 },
});
