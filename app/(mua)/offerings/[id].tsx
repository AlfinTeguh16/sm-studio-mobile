// app/(mua)/(tabs)/offerings/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const CARD_BG = "#F7F2FA";

type Offering = {
  id: number;
  mua_id: string;
  name_offer: string;
  offer_pictures?: string[];
  makeup_type?: string | null;
  person?: number | null;
  collaboration?: string | null;
  collaboration_price?: string | number | null;
  add_ons?: string[] | null;
  date?: string | null;
  price?: string | number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const formatIDR = (n?: number | string | null) => {
  const num = Number(n ?? 0);
  return `IDR ${new Intl.NumberFormat("id-ID").format(Number.isFinite(num) ? Math.round(num) : 0)}`;
};
const titleCase = (s?: string | null) =>
  (s ?? "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const toDateLabel = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
};

function useOfferingId() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = params?.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function MuaOfferingDetail() {
  const router = useRouter();
  const id = useOfferingId();

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false); // <— penanda token sudah dicoba dibaca
  const [item, setItem] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Ambil token dari SecureStore
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
        }
      } catch {}
      setTokenReady(true);
    })();
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!id) {
      setItem(null);
      setLoading(false);
      return;
    }
    // Kalau endpoint dilindungi dan tidak ada token → minta login
    if (!token) {
      setLoading(false);
      Alert.alert("Perlu Login", "Silakan login untuk melihat detail offering.", [
        { text: "Batal", style: "cancel" },
        { text: "Login", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }

    setLoading(true);
    try {
      const url = `${API}/offerings/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (!res.ok) {
        // log untuk debug
        const txt = await res.text().catch(() => "");
        console.warn("GET /offerings/:id failed", res.status, txt);
        if (res.status === 401) {
          throw new Error("Sesi berakhir atau belum login.");
        }
        throw new Error(`Gagal memuat (status ${res.status})`);
      }

      const json = await res.json().catch(() => ({}));
      const data: Offering | null =
        (json && typeof json === "object" && "data" in json ? (json.data as Offering) : (json as Offering)) || null;

      if (!data || typeof data.id === "undefined") {
        console.warn("Unexpected payload:", json);
        throw new Error("Format data tidak sesuai");
      }

      setItem(data);
    } catch (e: any) {
      setItem(null);
      Alert.alert(
        "Gagal",
        e?.message || "Tidak bisa memuat detail",
        e?.message?.includes("Sesi berakhir")
          ? [{ text: "Login", onPress: () => router.push("/(auth)/login") }, { text: "Tutup" }]
          : [{ text: "Tutup" }]
      );
    } finally {
      setLoading(false);
    }
  }, [id, token, router]);

  // Panggil fetch saat id & tokenReady siap (dan setiap token berubah)
  useEffect(() => {
    if (!tokenReady) return;
    fetchDetail();
  }, [tokenReady, fetchDetail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDetail();
    setRefreshing(false);
  }, [fetchDetail]);

  const pictures = useMemo(() => item?.offer_pictures ?? [], [item]);
  const hero = pictures[0] || "https://via.placeholder.com/1200x800.png?text=Offering";

  async function handleDelete() {
    if (!id || !token) return;
    Alert.alert("Hapus Offering", "Yakin ingin menghapus offering ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            setDeleting(true);
            const res = await fetch(`${API}/offerings/${encodeURIComponent(id)}`, {
              method: "DELETE",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "X-Requested-With": "XMLHttpRequest",
              },
            });
            if (!res.ok) {
              const msg = (await res.json().catch(() => ({})))?.message || `Gagal (status ${res.status})`;
              throw new Error(msg);
            }
            Alert.alert("Berhasil", "Offering telah dihapus.", [{ text: "OK", onPress: () => router.back() }]);
          } catch (e: any) {
            Alert.alert("Gagal", e?.message || "Tidak bisa menghapus.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={{ color: MUTED, marginBottom: 10 }}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={fetchDetail}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 6 }}>Muat Ulang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push({ pathname: "/offerings/[id]/edit", params: { id: String(item.id) } })}
          >
            <Ionicons name="create-outline" size={18} color={TEXT} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: "#FCA5A5" }]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Image source={{ uri: hero }} style={styles.hero} />
        {pictures.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {pictures.slice(1).map((p, i) => (
              <Image key={i} source={{ uri: p }} style={[styles.thumb, { marginRight: 8 }]} />
            ))}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Text style={styles.title}>{item.name_offer || "Tanpa Judul"}</Text>
          <Text style={styles.price}>{formatIDR(item.price)}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Jenis Make Up</Text>
            <Text style={styles.value}>{titleCase(item.makeup_type) || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Jumlah Orang</Text>
            <Text style={styles.value}>{item.person ?? "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Kolaborasi</Text>
            <Text style={styles.value}>
              {item.collaboration
                ? `${item.collaboration}${item.collaboration_price ? ` • ${formatIDR(item.collaboration_price)}` : ""}`
                : "Tidak ada"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Add-ons</Text>
            <Text style={styles.value}>{item.add_ons?.length ? item.add_ons.join(", ") : "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tanggal</Text>
            <Text style={styles.value}>{toDateLabel(item.date)}</Text>
          </View>

          <View style={[styles.metaBox, { marginTop: 12 }]}>
            <Text style={styles.metaText}>
              Dibuat: <Text style={{ fontWeight: "700" }}>{toDateLabel(item.created_at)}</Text>
            </Text>
            <Text style={styles.metaText}>
              Diubah: <Text style={{ fontWeight: "700" }}>{toDateLabel(item.updated_at)}</Text>
            </Text>
          </View>
        </View>
      </ScrollView>

      {deleting && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    flexDirection: "row",
  },
  hero: { width: "100%", height: 230, backgroundColor: "#eee" },
  thumb: { width: 90, height: 64, backgroundColor: "#eee", borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  title: { fontSize: 22, fontWeight: "800", color: TEXT },
  price: { marginTop: 6, fontSize: 18, fontWeight: "800", color: TEXT },
  row: {
    marginTop: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: { color: MUTED },
  value: { color: TEXT, fontWeight: "700" },
  metaBox: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    borderRadius: 12,
    padding: 12,
  },
  metaText: { color: MUTED, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});
