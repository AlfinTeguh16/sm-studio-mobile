// app/(user)/mua/[id].tsx
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
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import * as SecureStore from "expo-secure-store";

/* ========= Types ========= */
type MuaProfile = {
  id: string;
  role?: "mua";
  name: string;
  bio?: string | null;
  photo_url?: string | null;
  services?: string[] | null;
  location_lat?: string | null;
  location_lng?: string | null;
  address?: string | null;
  is_online?: boolean;
  created_at?: string;
  updated_at?: string;
};

type ApiResp<T> = { data?: T } | T;

type OfferingApi = {
  id: number;
  mua_id: string;
  name_offer: string;
  price?: string | number;
  makeup_type?: string | null;
  offer_pictures?: string[] | null;
};

/* ========= Const ========= */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_MUA = `${API_BASE}/mua`;
const API_OFFERINGS = `${API_BASE}/offerings`;

const PURPLE = "#AA60C8";
const TEXT_MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const BADGE_BG = "#F3E8FF";

/* ========= Helpers ========= */
type HeaderMap = Record<string, string>;

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
  const given = (init.headers || {}) as HeaderMap;
  const headers: HeadersInit = { ...given, Accept: "application/json" };

  const res = await fetch(url, { method: init.method ?? "GET", cache: "no-store", ...init, headers });

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

const titleCase = (s?: string) =>
  (s || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatIDR = (n: number) =>
  `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

/* ========= Screen ========= */
export default function MuaProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<MuaProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [offers, setOffers] = useState<OfferingApi[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        const json = await safeFetchJSON<ApiResp<MuaProfile>>(`${API_MUA}/${id}`, { headers });
        const data = (json as any)?.data ?? json;
        setProfile(data as MuaProfile);
      } catch (e: any) {
        if (e?.message === "401_UNAUTH") {
          Alert.alert("Sesi berakhir", "Silakan login kembali.");
          router.replace("/(auth)/login");
        } else {
          Alert.alert("Gagal", e?.message || "Tidak bisa memuat profil MUA.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  // Ambil offerings milik MUA ini
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoadingOffers(true);
        const headers = await getAuthHeaders();

        // coba server-side filter
        const resp = await safeFetchJSON<ApiResp<OfferingApi[]>>(`${API_OFFERINGS}?mua_id=${id}`, { headers });
        const listServer: OfferingApi[] = (resp as any)?.data ?? (resp as OfferingApi[]) ?? [];

        // kalau server belum filter, fallback client-side
        const list = Array.isArray(listServer) && listServer.length
          ? listServer
          : ((await safeFetchJSON<ApiResp<OfferingApi[]>>(API_OFFERINGS, { headers })) as any)?.data ?? [];

        const filtered = (list as OfferingApi[]).filter((o) => String(o.mua_id) === String(id));
        setOffers(filtered);
      } catch {
        setOffers([]);
      } finally {
        setLoadingOffers(false);
      }
    })();
  }, [id]);

  const lat = useMemo(() => Number(profile?.location_lat), [profile]);
  const lng = useMemo(() => Number(profile?.location_lng), [profile]);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const avatar =
    (profile?.photo_url && profile.photo_url.startsWith("http")
      ? profile.photo_url
      : profile?.photo_url
      ? `${API_ORIGIN}${profile.photo_url.startsWith("/") ? "" : "/"}${profile.photo_url}`
      : null) || "https://via.placeholder.com/400x400.png?text=MUA";

  function openMaps() {
    if (!hasCoords) return;
    const q = `${lat},${lng}`;
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?ll=${q}&q=${encodeURIComponent(profile?.name || "Lokasi")}`
        : `geo:${q}?q=${q}(${encodeURIComponent(profile?.name || "Lokasi")})`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Gagal", "Tidak bisa membuka peta.");
    });
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Text>Tidak ada data.</Text>
        <TouchableOpacity
          style={[styles.mapsBtn, { marginTop: 12 }]}
          onPress={() => router.replace("/(user)/(tabs)/index")}
        >
          <Text style={{ color: PURPLE, fontWeight: "800" }}>Kembali ke Beranda</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Header simple + back */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={18} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil MUA</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero / avatar + nama (tanpa telepon) */}
      <View style={styles.heroCard}>
        <Image source={{ uri: avatar }} style={styles.avatar} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.name}
            </Text>
            {profile.is_online ? (
              <View style={styles.dotOnline} />
            ) : (
              <View style={styles.dotOffline} />
            )}
          </View>
          {/* nomor hp DIHILANGKAN */}
        </View>
        {/* tombol Telepon DIHILANGKAN */}
      </View>

      {/* Services */}
      {Array.isArray(profile.services) && profile.services.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Layanan</Text>
          <View style={styles.tagsWrap}>
            {profile.services!.map((s) => (
              <View key={s} style={styles.tag}>
                <Text style={styles.tagText}>{titleCase(s)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Bio */}
      {profile.bio ? (
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Text style={styles.sectionTitle}>Tentang</Text>
          <Text style={styles.bodyText}>{profile.bio}</Text>
        </View>
      ) : null}

      {/* Alamat + Peta */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <Text style={styles.sectionTitle}>Alamat</Text>
        <Text style={styles.bodyText}>{profile.address || "-"}</Text>
        <View style={styles.mapBox}>
          {hasCoords ? (
            <MapView
              style={{ width: "100%", height: 210 }}
              initialRegion={{
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={{ latitude: lat, longitude: lng }} title={profile.name} />
            </MapView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { justifyContent: "center", alignItems: "center" }]}>
              <Text style={{ color: TEXT_MUTED }}>Koordinat tidak tersedia</Text>
            </View>
          )}
        </View>
        {hasCoords && (
          <TouchableOpacity onPress={openMaps} style={styles.mapsBtn}>
            <Ionicons name="map" size={16} color={PURPLE} />
            <Text style={{ color: PURPLE, fontWeight: "700", marginLeft: 6 }}>Buka di Maps</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ===== Jasa dari MUA ini ===== */}
      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <Text style={styles.sectionTitle}>Jasa dari MUA ini</Text>
        {loadingOffers ? (
          <ActivityIndicator style={{ marginTop: 6 }} />
        ) : offers.length === 0 ? (
          <Text style={{ color: TEXT_MUTED }}>Belum ada jasa.</Text>
        ) : (
          offers.map((of) => {
            const priceNum = Number(of.price ?? 0);
            const img = of.offer_pictures?.[0];
            return (
              <TouchableOpacity
                key={of.id}
                style={styles.offerCard}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: "/(user)/offerings/[id]", params: { id: String(of.id) } })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerTitle} numberOfLines={1}>{of.name_offer}</Text>
                  {of.makeup_type ? (
                    <Text style={styles.offerType}>{titleCase(of.makeup_type)}</Text>
                  ) : null}
                  <Text style={styles.offerPrice}>{formatIDR(priceNum)}</Text>
                </View>
                {img ? (
                  <Image source={{ uri: img }} style={styles.offerThumb} />
                ) : (
                  <View style={[styles.offerThumb, { backgroundColor: "#EEE" }]} />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

/* ========= Styles ========= */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  header: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontWeight: "800", fontSize: 18, color: "#111827" },

  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#eee" },
  name: { fontSize: 20, fontWeight: "800", color: "#111827", flexShrink: 1 },
  muted: { color: TEXT_MUTED, marginTop: 2 },
  dotOnline: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E", marginLeft: 8 },
  dotOffline: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#9CA3AF", marginLeft: 8 },

  sectionTitle: { fontWeight: "800", color: "#111827", marginBottom: 6 },
  bodyText: { color: "#111827" },

  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: BADGE_BG, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  tagText: { color: "#6B21A8", fontWeight: "700" },

  mapBox: {
    marginTop: 10,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    height: 210,
  },

  mapsBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F6F0FF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },

  // offerings list
  offerCard: {
    borderWidth: 1,
    borderColor: "#EDE9FE",
    backgroundColor: "#F7F2FA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  offerTitle: { fontWeight: "800", color: "#111827" },
  offerType: { color: TEXT_MUTED, marginTop: 2, fontSize: 12 },
  offerPrice: { marginTop: 6, fontWeight: "800", color: "#111827" },
  offerThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#fff" },
});
