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
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API = "https://smstudio.my.id/api";
const BASE = API.replace(/\/api$/, "");
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const CARD_BG = "#F7F2FA";

type Portfolio = {
  id: number | string;
  mua_id: string;
  name: string;
  photos?: string[] | string | null;
  makeup_type?: string | null;
  collaboration?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function toFullUrl(u: string) {
  return u?.startsWith("/storage/") ? `${BASE}${u}` : u;
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
  if (Array.isArray(p)) return p.filter(Boolean);
  try {
    const arr = JSON.parse(p);
    if (Array.isArray(arr)) return arr.filter(Boolean);
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

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [item, setItem] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // slider state
  const heroRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

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

  const load = useCallback(async () => {
    if (!id) {
      setItem(null);
      setLoading(false);
      Alert.alert("Oops", "ID tidak valid");
      return;
    }

    setLoading(true);
    const url = `${API}/portfolios/${encodeURIComponent(id)}`;

    const req = async (useAuth: boolean) => {
      const h: Record<string, string> = { Accept: "application/json" };
      if (useAuth && token) h.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers: h, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        console.warn("GET /portfolios/:id fail", {
          status: res.status,
          ct: res.headers.get("content-type"),
          body: text.slice(0, 200),
        });
        let msg: string | undefined;
        try {
          msg = JSON.parse(text)?.message;
        } catch {}
        const err: any = new Error(msg || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("Response bukan JSON");
      }
    };

    try {
      let json: any;
      if (token) {
        try {
          json = await req(true);
        } catch (e: any) {
          if (e?.status === 401) {
            console.log("Token invalid? Fallback tanpa token…");
            json = await req(false);
          } else {
            throw e;
          }
        }
      } else {
        json = await req(false);
      }

      const data: Portfolio = json?.data ?? json;
      if (!data || typeof data !== "object" || typeof data.id === "undefined") {
        throw new Error("Format data tidak sesuai");
      }
      setItem(data);
      // reset slider
      setIndex(0);
      // scroll ke awal
      requestAnimationFrame(() => {
        heroRef.current?.scrollTo({ x: 0, animated: false });
      });
    } catch (e: any) {
      if (e?.status === 401) {
        Alert.alert("Oops", "Sesi berakhir. Silakan login kembali.", [
          { text: "Login", onPress: () => router.replace("/(auth)/login") },
          { text: "Tutup" },
        ]);
      } else {
        Alert.alert("Oops", e?.message || "Gagal memuat portofolio");
      }
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id, token, router]);

  useEffect(() => {
    if (!tokenReady) return;
    load();
  }, [tokenReady, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    if (i !== index) setIndex(i);
  };

  const jumpTo = (i: number) => {
    setIndex(i);
    heroRef.current?.scrollTo({ x: i * width, animated: true });
  };

  if (loading) {
    return (
      <View style={[styles.center]}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ color: MUTED, marginTop: 6 }}>Memuat…</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={{ color: MUTED, marginBottom: 8 }}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 6 }}>Muat Ulang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pics = normalizePhotos(item.photos).map(toFullUrl);
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
          onPress={() => router.push({ pathname: "/(mua)/portfolio/[id]/edit", params: { id: String(item.id) } })}
        >
          <Ionicons name="create-outline" size={18} color={TEXT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* HERO SLIDER */}
        {pics.length ? (
          <View>
            <ScrollView
              ref={heroRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              contentContainerStyle={{}}
              style={{ width }}
            >
              {pics.map((p, i) => (
                <Image key={i} source={{ uri: p }} style={{ width, height: 260, backgroundColor: "#eee" }} />
              ))}
            </ScrollView>

            {/* Dots indicator */}
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
              <TouchableOpacity key={i} onPress={() => jumpTo(i)} activeOpacity={0.9}>
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

        {/* Body */}
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
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
