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
import authStorage from "../../../utils/authStorage";

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
      headers 
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

  // Load MUA profile
  useEffect(() => {
    if (!id) return;
    
    (async () => {
      try {
        setLoading(true);
        console.log(`[MuaProfile] Loading profile for MUA ID: ${id}`);
        
        const headers = await getAuthHeaders();
        const json = await safeFetchJSON<ApiResp<MuaProfile>>(`${API_MUA}/${id}`, { headers });
        const data = (json as any)?.data ?? json;
        
        console.log(`[MuaProfile] Profile loaded:`, data?.name);
        setProfile(data as MuaProfile);
      } catch (e: any) {
        console.error(`[MuaProfile] Error loading profile:`, e);
        
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
            "Gagal memuat profil", 
            e?.message || "Tidak bisa memuat profil MUA.",
            [{ text: "OK" }]
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  // Load offerings for this MUA - PERBAIKAN DI SINI
  useEffect(() => {
    if (!id) return;
    
    (async () => {
      try {
        setLoadingOffers(true);
        console.log(`[MuaProfile] Loading offerings for MUA ID: ${id}`);
        
        const headers = await getAuthHeaders();
        let list: OfferingApi[] = [];

        // Coba endpoint khusus untuk offerings MUA
        try {
          // Coba endpoint khusus: /api/mua/{id}/offerings
          const muaOffersUrl = `${API_MUA}/${id}/offerings`;
          console.log(`[MuaProfile] Trying MUA-specific offerings endpoint: ${muaOffersUrl}`);
          
          const resp = await safeFetchJSON<ApiResp<OfferingApi[]>>(muaOffersUrl, { headers });
          list = (resp as any)?.data ?? (resp as OfferingApi[]) ?? [];
          console.log(`[MuaProfile] MUA-specific offerings found:`, list.length);
          
        } catch (muaEndpointError) {
          console.warn(`[MuaProfile] MUA-specific endpoint failed, trying general endpoint with filter:`, muaEndpointError);
          
          // Fallback: ambil semua offerings dan filter di client
          try {
            const allOffers = await safeFetchJSON<ApiResp<OfferingApi[]>>(API_OFFERINGS, { headers });
            const allList = (allOffers as any)?.data ?? (allOffers as OfferingApi[]) ?? [];
            console.log(`[MuaProfile] All offerings loaded:`, allList.length);
            
            // Filter yang benar: hanya ambil offerings dengan mua_id yang sesuai
            list = allList.filter((o: { mua_id: any; id: any; }) => {
              const offerMuaId = String(o.mua_id).trim();
              const currentMuaId = String(id).trim();
              const isMatch = offerMuaId === currentMuaId;
              
              if (!isMatch) {
                console.log(`[MuaProfile] Filtered out offering:`, {
                  offeringId: o.id,
                  offeringMuaId: offerMuaId,
                  currentMuaId: currentMuaId,
                  match: isMatch
                });
              }
              
              return isMatch;
            });
            
            console.log(`[MuaProfile] Client-filtered offerings for MUA ${id}:`, list.length);
            
          } catch (generalError) {
            console.error(`[MuaProfile] General endpoint also failed:`, generalError);
            list = [];
          }
        }

        // Debug: log semua offerings yang ditemukan
        console.log(`[MuaProfile] Final offerings for MUA ${id}:`, list.map(o => ({
          id: o.id,
          name: o.name_offer,
          mua_id: o.mua_id,
          match: String(o.mua_id) === String(id)
        })));

        setOffers(list);
      } catch (e: any) {
        console.error(`[MuaProfile] Error loading offerings:`, e);
        
        if (e?.message === "401_UNAUTH") {
          router.replace("/(auth)/login");
        } else {
          // Silent fail for offerings - don't show alert
          setOffers([]);
        }
      } finally {
        setLoadingOffers(false);
      }
    })();
  }, [id, router]);

  const lat = useMemo(() => {
    const latVal = profile?.location_lat;
    return typeof latVal === 'string' ? parseFloat(latVal) : 
           typeof latVal === 'number' ? latVal : NaN;
  }, [profile]);

  const lng = useMemo(() => {
    const lngVal = profile?.location_lng;
    return typeof lngVal === 'string' ? parseFloat(lngVal) : 
           typeof lngVal === 'number' ? lngVal : NaN;
  }, [profile]);

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const avatar = useMemo(() => {
    if (!profile?.photo_url) return "https://via.placeholder.com/400x400.png?text=MUA";
    
    const photo = profile.photo_url;
    if (photo.startsWith("http://") || photo.startsWith("https://")) {
      return photo;
    }
    if (photo.startsWith("/")) {
      return `${API_ORIGIN}${photo}`;
    }
    return `${API_ORIGIN}/${photo}`;
  }, [profile?.photo_url]);

  function openMaps() {
    if (!hasCoords) {
      Alert.alert("Info", "Lokasi tidak tersedia untuk MUA ini.");
      return;
    }
    
    const q = `${lat},${lng}`;
    const locationName = encodeURIComponent(profile?.name || "Lokasi MUA");
    
    let url: string;
    if (Platform.OS === "ios") {
      url = `http://maps.apple.com/?ll=${q}&q=${locationName}`;
    } else {
      url = `geo:${q}?q=${q}(${locationName})`;
      
      Linking.canOpenURL(url).then(supported => {
        if (!supported) {
          return Linking.openURL(`https://maps.google.com/maps?q=${q}`);
        }
        return Linking.openURL(url);
      }).catch(() => {
        Linking.openURL(`https://maps.google.com/maps?q=${q}`).catch(() => {
          Alert.alert("Gagal", "Tidak bisa membuka aplikasi peta.");
        });
      });
      return;
    }
    
    Linking.openURL(url).catch(() => {
      Alert.alert("Gagal", "Tidak bisa membuka aplikasi peta.");
    });
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={{ marginTop: 12, color: TEXT_MUTED }}>Memuat profil MUA...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="person-outline" size={64} color={TEXT_MUTED} />
        <Text style={{ marginTop: 12, color: TEXT_MUTED, textAlign: "center" }}>
          Tidak dapat memuat data MUA
        </Text>
        <TouchableOpacity
          style={[styles.mapsBtn, { marginTop: 16 }]}
          onPress={() => router.back()}
        >
          <Text style={{ color: PURPLE, fontWeight: "800" }}>Kembali</Text>
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

      {/* Hero / avatar + nama */}
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
        </View>
      </View>

      {/* Services */}
      {Array.isArray(profile.services) && profile.services.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Layanan</Text>
          <View style={styles.tagsWrap}>
            {profile.services.map((s) => (
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
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker coordinate={{ latitude: lat, longitude: lng }} title={profile.name} />
            </MapView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="map-outline" size={32} color={TEXT_MUTED} />
              <Text style={{ color: TEXT_MUTED, marginTop: 8 }}>Lokasi tidak tersedia</Text>
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
        <Text style={styles.sectionTitle}>Jasa dari {profile.name}</Text>
        {loadingOffers ? (
          <ActivityIndicator style={{ marginTop: 6 }} color={PURPLE} />
        ) : offers.length === 0 ? (
          <Text style={{ color: TEXT_MUTED, textAlign: "center", marginTop: 12 }}>
            Belum ada jasa yang ditawarkan
          </Text>
        ) : (
          offers.map((of) => {
            const priceNum = Number(of.price ?? 0);
            const img = of.offer_pictures?.[0];
            const imageUrl = img ? (img.startsWith("http") ? img : `${API_ORIGIN}/${img}`) : null;
            
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
                  <Text style={styles.offerPrice}>
                    {priceNum > 0 ? formatIDR(priceNum) : "Harga belum tersedia"}
                  </Text>
                </View>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.offerThumb} />
                ) : (
                  <View style={[styles.offerThumb, { backgroundColor: "#EEE", justifyContent: "center", alignItems: "center" }]}>
                    <Ionicons name="image-outline" size={24} color={TEXT_MUTED} />
                  </View>
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