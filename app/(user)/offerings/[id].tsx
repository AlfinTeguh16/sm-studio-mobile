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
import authStorage from "../../../utils/authStorage"; // ✅ GUNAKAN AUTH STORAGE YANG SAMA

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

// ✅ GUNAKAN AUTH STORAGE YANG SAMA
async function getAuthHeaders(): Promise<HeaderMap> {
  try {
    const token = await authStorage.getAuthToken();
    const h: HeaderMap = { 
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  } catch (error) {
    console.warn("[getAuthHeaders] Error:", error);
    return { Accept: "application/json" };
  }
}

async function safeFetchJSON<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  try {
    const given = (init.headers || {}) as HeaderMap;
    const headers: HeadersInit = { ...given, Accept: "application/json" };

    const res = await fetch(url, {
      method: init.method ?? "GET",
      cache: "no-store",
      ...init,
      headers,
    });

    const text = await res.text();

    if (!res.ok) {
      if (res.status === 401) {
        console.log("[safeFetchJSON] 401 Unauthorized - Clearing auth");
        await authStorage.clearAuthAll();
        throw new Error("401_UNAUTH");
      }
      throw new Error(`HTTP ${res.status} — ${text.slice(0, 160)}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Unexpected non-JSON — ${text.slice(0, 160)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "401_UNAUTH") {
      throw error;
    }
    console.warn("[safeFetchJSON] Network error:", error);
    throw new Error("Network error: " + (error instanceof Error ? error.message : String(error)));
  }
}

/* ============ Screen ============ */
export default function OfferingDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<Offering | null>(null);
  const [mua, setMua] = useState<MuaLoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapFallback, setMapFallback] = useState(false);

  // Sembunyikan header default
  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  // Load offering detail and MUA data
  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      try {
        console.log(`[OfferingDetail] Loading offering ID: ${id}`);
        const headers = await getAuthHeaders();

        // 1) Load offering detail
        const detail = await safeFetchJSON<{ data?: Offering } | Offering>(
          `${API_OFFERINGS}/${id}`,
          { headers }
        );
        const data: Offering = (detail as any)?.data ?? (detail as Offering);
        console.log(`[OfferingDetail] Offering loaded:`, data.name_offer);
        setItem(data);

        // 2) Load MUA location data
        try {
          const mjson = await safeFetchJSON<{ data?: MuaLoc[] } | MuaLoc[]>(
            API_MUA_LOC,
            { headers }
          );
          const list: MuaLoc[] = (mjson as any)?.data ?? (mjson as MuaLoc[]) ?? [];
          const found = list.find((m) => m.id === data.mua_id) || null;
          console.log(`[OfferingDetail] MUA data:`, found ? "found" : "not found");
          setMua(found);
        } catch (muaError) {
          console.warn(`[OfferingDetail] Failed to load MUA data:`, muaError);
          setMua(null);
        }
      } catch (e: any) {
        console.error(`[OfferingDetail] Error loading data:`, e);
        
        if (e?.message === "401_UNAUTH") {
          Alert.alert("Sesi berakhir", "Silakan login kembali.", [
            {
              text: "OK",
              onPress: () => {
                router.replace("/(auth)/login");
              }
            }
          ]);
        } else {
          Alert.alert(
            "Gagal memuat detail", 
            e?.message || "Tidak bisa memuat detail jasa.",
            [{ text: "OK" }]
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const priceNum = useMemo(() => Number(item?.price ?? 0), [item]);
  
  const mainImage = useMemo(() => {
    if (!item?.offer_pictures?.[0]) {
      return "https://via.placeholder.com/1200x800.png?text=Offering+Image";
    }
    
    const imageUrl = item.offer_pictures[0];
    if (imageUrl.startsWith("http")) {
      return imageUrl;
    }
    return `${API_ORIGIN}${imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}`;
  }, [item?.offer_pictures]);

  const lat = useMemo(() => {
    const latVal = mua?.location_lat;
    return typeof latVal === 'string' ? parseFloat(latVal) : 
           typeof latVal === 'number' ? latVal : NaN;
  }, [mua]);

  const lng = useMemo(() => {
    const lngVal = mua?.location_lng;
    return typeof lngVal === 'string' ? parseFloat(lngVal) : 
           typeof lngVal === 'number' ? lngVal : NaN;
  }, [mua]);

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // Static map OSM; gagal → fallback ke MapView
  const staticMapUrl = useMemo(() => {
    if (!hasCoords) return null;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=700x350&scale=2&markers=${lat},${lng},red`;
  }, [hasCoords, lat, lng]);

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={{ marginTop: 12, color: TEXT_MUTED }}>Memuat detail jasa...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={64} color={TEXT_MUTED} />
        <Text style={{ marginTop: 12, color: TEXT_MUTED, textAlign: "center" }}>
          Tidak dapat memuat data jasa
        </Text>
        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 16 }]}
          onPress={() => router.back()}
        >
          <Text style={{ color: PURPLE, fontWeight: "700" }}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Hero image + back */}
      <View style={styles.heroContainer}>
        <Image 
          source={{ uri: mainImage }} 
          style={styles.hero} 
          defaultSource={{ uri: "https://via.placeholder.com/1200x800.png?text=Loading..." }}
        />
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        
        {/* Price badge on hero image */}
        {priceNum > 0 && (
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>{formatIDR(priceNum)}</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Text style={styles.title}>{item.name_offer || "Tanpa Judul"}</Text>
        <Text style={styles.vendor}>Oleh: {mua?.name || "MUA"}</Text>

        {/* Jenis */}
        <View style={{ marginTop: 18 }}>
          <Text style={styles.label}>Jenis Make Up</Text>
          <Text style={styles.value}>{titleCase(item.makeup_type) || "Tidak tersedia"}</Text>
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
            <Text style={[styles.value, { color: TEXT_MUTED }]}>Tidak berkolaborasi</Text>
          )}
        </View>

        {/* Add-ons jika ada */}
        {item.add_ons && item.add_ons.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Tambahan Layanan</Text>
            {item.add_ons.map((addon, index) => (
              <Text key={index} style={[styles.value, { marginTop: 4 }]}>
                • {titleCase(addon)}
              </Text>
            ))}
          </View>
        )}

        {/* Lokasi */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>Lokasi MUA</Text>
          <Text style={styles.value}>{mua?.address || "Alamat tidak tersedia"}</Text>

          <View style={styles.mapBox}>
            {!hasCoords ? (
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map-outline" size={32} color={TEXT_MUTED} />
                <Text style={styles.mapPlaceholderText}>Peta tidak tersedia</Text>
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
                scrollEnabled={false}
                zoomEnabled={false}
              >
                <Marker coordinate={{ latitude: lat, longitude: lng }} title={mua?.name} />
              </MapView>
            )}
          </View>
        </View>

        {/* Harga */}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Harga</Text>
          <Text style={styles.price}>
            {priceNum > 0 ? formatIDR(priceNum) : "Harga belum tersedia"}
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[
            styles.cta,
            priceNum <= 0 && styles.ctaDisabled
          ]}
          onPress={() =>
            router.push({
              pathname: "/(user)/bookings/new",
              params: { 
                offeringId: String(item?.id ?? id),
                offeringName: item.name_offer,
                offeringPrice: String(priceNum),
                muaId: item.mua_id,
                muaName: mua?.name || "MUA"
              }
            })
          }
          disabled={priceNum <= 0}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
            {priceNum > 0 ? "Pesan Sekarang" : "Tidak Dapat Dipesan"}
          </Text>
        </TouchableOpacity>

        {/* Info tambahan */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Informasi Tambahan</Text>
          <Text style={styles.infoText}>
            • Pastikan untuk menghubungi MUA terlebih dahulu untuk konfirmasi ketersediaan
          </Text>
          <Text style={styles.infoText}>
            • Harga dapat berubah tergantung kompleksitas permintaan
          </Text>
          <Text style={styles.infoText}>
            • Pembayaran dilakukan setelah konfirmasi dari MUA
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ============ Styles ============ */
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#fff" 
  },
  heroContainer: {
    position: "relative",
  },
  hero: { 
    width: "100%", 
    height: 260, 
    backgroundColor: "#f3f4f6" 
  },
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  priceBadge: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: "rgba(170, 96, 200, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  title: { 
    fontSize: 26, 
    fontWeight: "800", 
    color: "#1F2937",
    lineHeight: 32,
  },
  vendor: { 
    marginTop: 6, 
    color: TEXT_MUTED,
    fontSize: 16,
  },
  label: { 
    fontWeight: "800", 
    marginBottom: 6, 
    color: "#1F2937",
    fontSize: 16,
  },
  value: { 
    color: "#1F2937",
    fontSize: 16,
    lineHeight: 22,
  },

  mapBox: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  mapPlaceholder: {
    height: 210,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  mapPlaceholderText: {
    color: TEXT_MUTED,
    marginTop: 8,
    fontSize: 14,
  },

  priceRow: {
    marginTop: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: { 
    fontSize: 18, 
    fontWeight: "800",
    color: "#1F2937",
  },
  price: { 
    fontSize: 18, 
    fontWeight: "800",
    color: PURPLE,
  },

  cta: {
    marginTop: 18,
    backgroundColor: PURPLE,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaDisabled: {
    backgroundColor: TEXT_MUTED,
    opacity: 0.6,
  },

  secondaryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PURPLE,
    alignItems: "center",
  },

  infoSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoTitle: {
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 8,
    fontSize: 16,
  },
  infoText: {
    color: TEXT_MUTED,
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
});