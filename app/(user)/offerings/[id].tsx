import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import * as SecureStore from "expo-secure-store";

/* ============ Types ============ */
type Offering = {
  id: number;
  mua_id: string;
  name_offer: string;
  offer_pictures?: string[];
  makeup_type?: string;
  collaboration?: string | null;
  collaboration_price?: string | number | null;
  add_ons?: string[];
  date?: string | null;
  price?: string | number;
  created_at?: string;
  updated_at?: string;
};
type MuaLoc = {
  id: string;
  name: string;
  location_lat: string;
  location_lng: string;
  address?: string;
  photo_url?: string;
};

/* ============ Const ============ */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_OFFERINGS = `${API_BASE}/offerings`;
const API_MUA_LOC = `${API_BASE}/mua-location`;
const PURPLE = "#AA60C8";
const TEXT_MUTED = "#6B7280";
const BORDER = "#E5E7EB";

/* ============ Helpers ============ */
const formatIDR = (n: number) =>
  `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
const titleCase = (s?: string) =>
  (s || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

type HeaderMap = Record<string, string>;

function absolutize(url: string | null | undefined) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

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

async function safeFetchJSON<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  // gabungkan headers secara type-safe
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

/* ============ Screen ============ */
export default function OfferingDetail() {
  const router = useRouter();
  const navigation = useNavigation(); // sembunyikan header
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<Offering | null>(null);
  const [mua, setMua] = useState<MuaLoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapFallback, setMapFallback] = useState(false);

  // Sembunyikan header default “offerings/[id]”
  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();

        // 1) detail offering
        const detail = await safeFetchJSON<{ data?: Offering } | Offering>(
          `${API_OFFERINGS}/${id}`,
          { headers }
        );
        const data: Offering = (detail as any)?.data ?? (detail as Offering);
        setItem(data);

        // 2) lokasi MUA
        const mjson = await safeFetchJSON<{ data?: MuaLoc[] } | MuaLoc[]>(
          API_MUA_LOC,
          { headers }
        );
        const list: MuaLoc[] = (mjson as any)?.data ?? (mjson as MuaLoc[]) ?? [];
        const found = list.find((m) => m.id === data.mua_id) || null;
        setMua(found);
      } catch (e: any) {
        if (e?.message === "401_UNAUTH") {
          Alert.alert("Sesi berakhir", "Silakan login kembali.");
          await SecureStore.deleteItemAsync("auth").catch(() => {});
          router.replace("/(auth)/login");
        } else {
          Alert.alert("Gagal", e?.message || "Tidak bisa memuat detail");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const priceNum = useMemo(() => Number(item?.price ?? 0), [item]);
  const mainImage =
    item?.offer_pictures?.[0] ||
    "https://via.placeholder.com/1200x800.png?text=Offering";

  const lat = useMemo(() => Number(mua?.location_lat), [mua]);
  const lng = useMemo(() => Number(mua?.location_lng), [mua]);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // Static map OSM; gagal → fallback ke MapView
  const staticMapUrl = useMemo(() => {
    if (!hasCoords) return null;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=700x350&scale=2&markers=${lat},${lng},red`;
  }, [hasCoords, lat, lng]);

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Text>Tidak ada data.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Hero image + back */}
      <View>
        <Image source={{ uri: mainImage }} style={styles.hero} />
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Text style={styles.title}>{item.name_offer || "Tanpa Judul"}</Text>
        <Text style={styles.vendor}>{mua?.name || "MUA"}</Text>

        {/* Jenis */}
        <View style={{ marginTop: 18 }}>
          <Text style={styles.label}>Jenis Make Up</Text>
          <Text style={styles.value}>{titleCase(item.makeup_type) || "-"}</Text>
        </View>

        {/* Kolaborasi */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>Kolaborasi</Text>
          {item.collaboration ? (
            <Text style={styles.value}>
              {item.collaboration}
              {item.collaboration_price
                ? ` • ${formatIDR(Number(item.collaboration_price))}`
                : ""}
            </Text>
          ) : (
            <Text style={styles.value}>Jasa ini tidak berkolaborasi</Text>
          )}
        </View>

        {/* Lokasi */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>Lokasi MUA</Text>
          <Text style={styles.value}>{mua?.address || "-"}</Text>

          <View style={styles.mapBox}>
            {!hasCoords ? (
              <View style={{ padding: 16 }}>
                <Text style={{ color: TEXT_MUTED }}>Map tidak tersedia</Text>
              </View>
            ) : !mapFallback && staticMapUrl ? (
              <Image
                source={{ uri: staticMapUrl }}
                style={{ width: "100%", height: 210 }}
                resizeMode="cover"
                onError={() => setMapFallback(true)}
              />
            ) : (
              <MapView
                style={{ width: "100%", height: 210 }}
                initialRegion={{
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker coordinate={{ latitude: lat, longitude: lng }} title={mua?.name} />
              </MapView>
            )}
          </View>
        </View>

        {/* Harga */}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Harga</Text>
          <Text style={styles.price}>{formatIDR(priceNum)}</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.cta}
          onPress={() =>
            router.push({
              pathname: "/(user)/bookings/new",
              params: { offeringId: String(item?.id ?? id) }, // kirim ID offering
            })
          }
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Pesan Sekarang</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/* ============ Styles ============ */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  hero: { width: "100%", height: 260, backgroundColor: "#eee" },
  back: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#1F2937" },
  vendor: { marginTop: 6, color: TEXT_MUTED },
  label: { fontWeight: "800", marginBottom: 4, color: "#1F2937" },
  value: { color: "#1F2937" },

  mapBox: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },

  priceRow: {
    marginTop: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceLabel: { fontSize: 18, fontWeight: "800" },
  price: { fontSize: 18, fontWeight: "800" },

  cta: {
    marginTop: 18,
    backgroundColor: PURPLE,
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
