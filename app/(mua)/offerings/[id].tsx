// app/(mua)/(tabs)/offerings/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, useWindowDimensions,
  NativeScrollEvent, NativeSyntheticEvent
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
// CHANGED: gunakan authStorage helper (sesuaikan path jika perlu)
import authStorage from "../../../utils/authStorage";

const API = "https://smstudio.my.id/api";
const BASE = API.replace(/\/api$/,""); // untuk prefix /storage/...
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const CARD_BG = "#F7F2FA";

type Offering = {
  id: number;
  mua_id: string;
  name_offer: string;
  offer_pictures?: string[] | null;
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

function absolutize(u: string) {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/storage/")) return `${BASE}${u}`;
  return u;
}

export default function MuaOfferingDetail() {
  const router = useRouter();
  const id = useOfferingId();
  const { width } = useWindowDimensions();

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [item, setItem] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // slider state
  const picturesRaw = useMemo(() => item?.offer_pictures ?? [], [item]);
  const pictures = useMemo(() => (picturesRaw || []).map(absolutize).filter(Boolean), [picturesRaw]);
  const [slide, setSlide] = useState(0);

  // Robust token load: try authStorage, then fallback to legacy SecureStore 'auth' object
  useEffect(() => {
    (async () => {
      try {
        // 1) primary: authStorage.getAuthToken()
        const t1 = await authStorage.getAuthToken().catch(() => null);
        if (t1) {
          console.log("[OfferingDetail] token from authStorage");
          setToken(t1);
          setTokenReady(true);
          return;
        }

        // 2) fallback: legacy "auth" object in SecureStore
        try {
          const raw = await SecureStore.getItemAsync("auth");
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const candidate = parsed?.token ?? parsed?.access_token ?? parsed?.data?.token ?? null;
              if (candidate) {
                console.log("[OfferingDetail] token from SecureStore 'auth' object");
                setToken(candidate);
                setTokenReady(true);
                return;
              } else {
                console.warn("[OfferingDetail] SecureStore auth found but no token property");
              }
            } catch (err) {
              console.warn("[OfferingDetail] failed parse SecureStore auth", err);
            }
          } else {
            console.warn("[OfferingDetail] SecureStore 'auth' empty");
          }
        } catch (err) {
          console.warn("[OfferingDetail] error reading SecureStore 'auth'", err);
        }

        // 3) nothing found — still mark tokenReady so fetchDetail won't hang forever
        console.warn("[OfferingDetail] no token found (authStorage + SecureStore empty)");
        setToken(null);
        setTokenReady(true);
      } catch (err) {
        console.warn("[OfferingDetail] token load error:", err);
        setTokenReady(true);
      }
    })();
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!id) {
      setItem(null);
      setLoading(false);
      return;
    }

    // If token not ready yet, wait
    if (!tokenReady) return;

    // if no token after trying all fallbacks -> ask login (don't auto redirect before showing message)
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
      const res = await fetch(`${API}/offerings/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn("GET /offerings/:id failed", res.status, txt);
        if (res.status === 401) {
          // clear auth to avoid loop, then navigate to login
          try {
            await authStorage.clearAuthAll().catch(()=>{});
          } catch {}
          throw new Error("Sesi berakhir atau belum login.");
        }
        throw new Error(`Gagal memuat (status ${res.status})`);
      }

      const json = await res.json().catch(() => ({}));
      const data: Offering | null =
        (json && typeof json === "object" && "data" in json ? (json.data as Offering) : (json as Offering)) || null;

      if (!data || typeof data.id === "undefined") throw new Error("Format data tidak sesuai");

      setItem(data);
      setSlide(0);
    } catch (e: any) {
      setItem(null);
      const isSession = (e?.message || "").toLowerCase().includes("sesi berakhir") || (e?.message || "").toLowerCase().includes("401");
      Alert.alert(
        "Gagal",
        e?.message || "Tidak bisa memuat detail",
        isSession
          ? [{ text: "Login", onPress: () => router.push("/(auth)/login") }, { text: "Tutup" }]
          : [{ text: "Tutup" }]
      );
    } finally {
      setLoading(false);
    }
  }, [id, token, tokenReady, router]);

  useEffect(() => {
    if (!tokenReady) return;
    fetchDetail();
  }, [tokenReady, fetchDetail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDetail();
    setRefreshing(false);
  }, [fetchDetail]);

  function onHeroScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / Math.max(1, width));
    if (idx !== slide) setSlide(idx);
  }

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
              headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
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

  const canSlide = pictures.length > 1;
  const heroFallback = "https://via.placeholder.com/1200x800.png?text=Offering";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push({ pathname: "/(mua)/offerings/[id]/edit", params: { id: String(item.id) } })}
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
        {/* HERO SLIDER */}
        {canSlide ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onHeroScroll}
              scrollEventThrottle={16}
            >
              {pictures.map((u, i) => (
                <Image
                  key={`${u}-${i}`}
                  source={{ uri: u || heroFallback }}
                  style={[styles.hero, { width }]}
                />
              ))}
            </ScrollView>

            {/* dots */}
            <View style={styles.dotsWrap}>
              {pictures.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === slide && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        ) : (
          <Image source={{ uri: pictures[0] || heroFallback }} style={[styles.hero, { width }]} />
        )}

        {/* Thumbnails (opsional) */}
        {pictures.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
          >
            {pictures.map((p, i) => (
              <TouchableOpacity key={i} onPress={() => setSlide(i)}>
                <Image
                  source={{ uri: p }}
                  style={[
                    styles.thumb,
                    { marginRight: 8, borderColor: i === slide ? PURPLE : BORDER },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Detail */}
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

  hero: { height: 260, backgroundColor: "#eee" },
  dotsWrap: {
    position: "absolute",
    bottom: 10,
    left: 0, right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#ffffff88",
  },
  dotActive: {
    backgroundColor: PURPLE,
  },

  thumb: {
    width: 90, height: 64, backgroundColor: "#eee",
    borderRadius: 10, borderWidth: 2, borderColor: BORDER,
  },

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
