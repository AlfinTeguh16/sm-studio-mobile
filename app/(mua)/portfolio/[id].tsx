// app/(mua)/portfolio/[id].tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
// gunakan getAuthToken kalau tersedia di project (fallback SecureStore)
import { getAuthToken } from "../../../utils/authStorage";

const API = "https://smstudio.my.id/api";
const BASE = API.replace(/\/api$/, "");
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const CARD_BG = "#F7F2FA";

type Portfolio = {
  id: number | string;
  mua_id?: string;
  name?: string;
  photos?: string[] | string | null;
  makeup_type?: string | null;
  collaboration?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function toFullUrl(u?: string | null) {
  if (!u) return "";
  return u.startsWith("/storage/") ? `${BASE}${u}` : u;
}
function titleCase(s?: string | null) {
  return (s ?? "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function toDateLabel(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(+d)
    ? d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    : iso;
}
function normalizePhotos(p?: string[] | string | null): string[] {
  if (!p) return [];
  if (Array.isArray(p)) return p.filter(Boolean).map(String);
  try {
    const arr = JSON.parse(String(p));
    if (Array.isArray(arr)) return arr.filter(Boolean).map(String);
  } catch {}
  return String(p)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function PortfolioDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();

  // ref ke ScrollView
  const heroRef = useRef<ScrollView | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [item, setItem] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [index, setIndex] = useState(0);

  // ambil token dari util getAuthToken() dulu, fallback SecureStore
  useEffect(() => {
    (async () => {
      try {
        let t: string | null = null;
        if (typeof getAuthToken === "function") {
          try {
            t = await getAuthToken();
          } catch (e) {
            // ignore
          }
        }
        if (!t) {
          const raw = await SecureStore.getItemAsync("auth");
          if (raw) {
            try {
              const auth = JSON.parse(raw);
              t = auth?.token ?? auth?.accessToken ?? auth?.access_token ?? null;
            } catch {}
          }
        }
        if (t) setToken(String(t));
      } catch (e) {
        console.warn("bootstrap token failed:", e);
      } finally {
        setTokenReady(true); // penting: menandai selesai bootstrap, walau token null
      }
    })();
  }, []);

  const fetchPortfolio = useCallback(async () => {
    if (!id) {
      setItem(null);
      setLoading(false);
      Alert.alert("Oops", "ID portofolio tidak valid.");
      return;
    }

    setLoading(true);
    const url = `${API}/portfolios/${encodeURIComponent(String(id))}`;

    async function doReq(useAuth: boolean) {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (useAuth && token) headers.Authorization = `Bearer ${token}`;

      console.log("[PORTFOLIO] GET", url, "useAuth:", useAuth, "headers:", Object.keys(headers));
      const res = await fetch(url, { headers, cache: "no-store" });
      const text = await res.text();
      const ct = res.headers.get("content-type") || "";

      if (!res.ok) {
        // 401 -> sesi bermasalah
        if (res.status === 401) {
          let parsed = null;
          try { parsed = JSON.parse(text); } catch {}
          const msg = parsed?.message ?? "Unauthenticated.";
          const err: any = new Error(msg);
          err.status = 401;
          throw err;
        }

        console.warn("GET /portfolios/:id failed", { status: res.status, ct, body: text.slice(0, 400) });
        let msg: string | undefined;
        try { msg = JSON.parse(text)?.message; } catch {}
        const err: any = new Error(msg || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      if (!ct.includes("application/json")) {
        const snippet = text ? text.slice(0, 400) : "";
        const err: any = new Error(`Response bukan JSON: ${snippet}`);
        err.status = res.status;
        throw err;
      }

      try {
        return JSON.parse(text);
      } catch {
        const err: any = new Error("Gagal parse JSON.");
        err.status = res.status;
        throw err;
      }
    }

    try {
      // hanya panggil setelah tokenReady agar tidak terjadi request prematur
      // caller memastikan tokenReady; tapi double-check
      let json: any;
      if (token) {
        try {
          json = await doReq(true);
        } catch (e: any) {
          if (e?.status === 401) {
            // token expired / invalid -> hapus auth dan redirect ke login
            await SecureStore.deleteItemAsync("auth").catch(() => {});
            Alert.alert("Sesi Berakhir", "Sesi Anda kadaluarsa. Silakan login kembali.", [
              { text: "Login", onPress: () => router.replace("/(auth)/login") },
            ]);
            setItem(null);
            setLoading(false);
            return;
          } else {
            // coba fallback tanpa auth (resource publik)
            json = await doReq(false);
          }
        }
      } else {
        json = await doReq(false);
      }

      const data: Portfolio = json?.data ?? json;
      if (!data || typeof data !== "object" || typeof data.id === "undefined") {
        throw new Error("Data portofolio tidak valid.");
      }

      setItem(data);
      setIndex(0);
      // scroll ke awal
      setTimeout(() => {
        try {
          heroRef.current?.scrollTo?.({ x: 0, animated: false });
        } catch {}
      }, 0);
    } catch (e: any) {
      if (e?.status === 401) {
        // di-handle di atas, fallback juga
        Alert.alert("Sesi berakhir", "Silakan login kembali.", [
          { text: "Login", onPress: () => router.replace("/(auth)/login") },
        ]);
      } else {
        Alert.alert("Gagal", e?.message || "Tidak bisa memuat portofolio.");
        console.warn("fetchPortfolio error:", e);
      }
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id, token, router]);

  // panggil fetch hanya saat tokenReady (tidak prematur)
  useEffect(() => {
    if (!tokenReady) return;
    fetchPortfolio();
  }, [tokenReady, fetchPortfolio]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPortfolio();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPortfolio]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / Math.max(1, width));
    if (i !== index) setIndex(i);
  };

  const jumpTo = (i: number) => {
    setIndex(i);
    try {
      heroRef.current?.scrollTo?.({ x: i * Math.max(1, width), animated: true });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ color: MUTED, marginTop: 6 }}>Memuat…</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={{ color: MUTED, marginBottom: 8 }}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={fetchPortfolio}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 6 }}>Muat Ulang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pics = normalizePhotos(item.photos).map(toFullUrl).filter(Boolean);
  const hasMultiple = pics.length > 1;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={TEXT} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {item.name || "Portofolio"}
        </Text>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() =>
            router.push({ pathname: "/(mua)/portfolio/[id]/edit", params: { id: String(item.id) } })
          }
        >
          <Ionicons name="create-outline" size={18} color={TEXT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* HERO */}
        {pics.length ? (
          <View>
            <ScrollView
              // ref sebagai callback yang mengembalikan void (tidak mengembalikan nilai)
              ref={(r) => {
                heroRef.current = r;
              }}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              style={{ width }}
            >
              {pics.map((p, i) => (
                <Image
                  key={`${p}-${i}`}
                  source={{ uri: p }}
                  style={{ width: Math.max(1, width), height: 260, backgroundColor: "#eee" }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>

            {hasMultiple && (
              <View style={styles.dotsWrap} pointerEvents="none">
                {pics.map((_, i) => (
                  <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <Image
            source={{ uri: "https://via.placeholder.com/1200x800.png?text=Portfolio" }}
            style={{ width: "100%", height: 260, backgroundColor: "#eee" }}
            resizeMode="cover"
          />
        )}

        {/* Thumbnails */}
        {hasMultiple && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
          >
            {pics.map((p, i) => (
              <TouchableOpacity key={`${p}-${i}`} onPress={() => jumpTo(i)} activeOpacity={0.9}>
                <Image
                  source={{ uri: p }}
                  style={[
                    styles.thumb,
                    { marginRight: 8, borderColor: i === index ? PURPLE : BORDER, borderWidth: 2 },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* BODY */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Text style={styles.title}>{item.name}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Tipe Make Up</Text>
            <Text style={styles.value}>{titleCase(item.makeup_type) || "—"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Kolaborasi</Text>
            <Text style={styles.value}>{item.collaboration || "—"}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 14, android: 10 }),
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: TEXT, maxWidth: 220, textAlign: "center" },
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

  thumb: { width: 90, height: 64, backgroundColor: "#eee", borderRadius: 10 },
  title: { fontSize: 22, fontWeight: "800", color: TEXT },

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

  metaBox: { backgroundColor: CARD_BG, borderWidth: 1, borderColor: "#EDE9FE", borderRadius: 12, padding: 12 },
  metaText: { color: MUTED, marginTop: 2 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },

  dotsWrap: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7 / 2,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
