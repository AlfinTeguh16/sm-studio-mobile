import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import authStorage from "../../../../utils/authStorage"; // ✅ GUNAKAN AUTH STORAGE YANG SAMA

/* =============== Types =============== */
type OfferingApi = {
  id: number;
  mua_id: string;
  name_offer: string;
  offer_pictures?: string[];
  makeup_type?: string | null;
  price?: string | number;
};

type ApiPage<T> = {
  data: T[];
  next_page_url: string | null;
};

type MuaLoc = {
  id: string;
  name: string;
  location_lat: string;
  location_lng: string;
  address?: string;
  photo_url?: string;
};

type Row = OfferingApi & {
  priceNum: number;
  mua?: MuaLoc;
  distanceKm?: number | null;
};

/* =============== Consts & helpers =============== */
const API_BASE = "https://smstudio.my.id";
const API_OFFERINGS = `${API_BASE}/api/offerings`;
const API_MUA_LOC = `${API_BASE}/api/mua-location`;

const CARD_BG = "#F7F0FF";
const BORDER = "#E9DDF7";
const TEXT_MUTED = "#6B7280";
const PURPLE = "#AA60C8";

const formatIDR = (n: number) =>
  `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

function toTitle(s?: string | null) {
  if (!s) return "";
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function absolutize(url: string | null | undefined) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

// ✅ GUNAKAN AUTH STORAGE YANG SAMA
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

async function getUserCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      console.log("[getUserCoords] Location services disabled");
      return null;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.log("[getUserCoords] Location permission denied");
      return null;
    }

    // Coba dapatkan last known position dulu (lebih cepat)
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      console.log("[getUserCoords] Using last known position");
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }

    // Jika tidak ada last known, dapatkan current position
    console.log("[getUserCoords] Getting current position");
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (error) {
    console.warn("[getUserCoords] Error getting location:", error);
    return null;
  }
}

/* =============== Screen =============== */
export default function OfferingsScreen() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"distance" | "priceAsc" | "priceDesc">("distance");
  const [showFilter, setShowFilter] = useState(false);

  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  const [muaMap, setMuaMap] = useState<Record<string, MuaLoc>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // lokasi user (opsional)
  useEffect(() => {
    (async () => {
      const coords = await getUserCoords();
      setUserLoc(coords);
      console.log("[OfferingsScreen] User location:", coords);
    })();
  }, []);

  // fetch MUA map + halaman pertama offerings
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        console.log("[OfferingsScreen] Loading initial data...");
        const headers = await getAuthHeaders();

        const [muaJson, offJson] = await Promise.all([
          safeFetchJSON<{ data: MuaLoc[] }>(API_MUA_LOC, { headers }),
          safeFetchJSON<ApiPage<OfferingApi>>(API_OFFERINGS, { headers }),
        ]);

        // Build MUA map
        const mmap: Record<string, MuaLoc> = {};
        const muaData = muaJson.data ?? [];
        console.log(`[OfferingsScreen] Loaded ${muaData.length} MUA locations`);
        
        for (const m of muaData) {
          mmap[m.id] = m;
        }
        setMuaMap(mmap);

        // Process offerings
        const page = offJson?.data ?? [];
        console.log(`[OfferingsScreen] Loaded ${page.length} offerings`);
        
        const mapped: Row[] = page.map((o) => ({
          ...o,
          priceNum: Number(o.price ?? 0),
          mua: mmap[o.mua_id],
        }));
        
        setRows(mapped);
        setNextUrl(absolutize(offJson?.next_page_url));
        
        console.log(`[OfferingsScreen] Initial data loaded successfully`);
      } catch (e: any) {
        console.error("[OfferingsScreen] Error loading data:", e);
        
        if (e?.message === "401_UNAUTH") {
          setError("Sesi berakhir. Silakan login kembali.");
          Alert.alert("Sesi Berakhir", "Silakan login kembali.", [
            {
              text: "OK",
              onPress: () => {
                router.replace("/(auth)/login");
              }
            }
          ]);
        } else {
          setError(e?.message || "Gagal memuat data offerings.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // load more (pakai next_page_url)
  async function loadMore() {
    if (!nextUrl || loadingMore) return;
    
    setLoadingMore(true);
    try {
      console.log("[OfferingsScreen] Loading more data...");
      const headers = await getAuthHeaders();
      const url = absolutize(nextUrl) || nextUrl;

      const json = await safeFetchJSON<ApiPage<OfferingApi>>(url, { headers });
      const page = json?.data ?? [];
      
      console.log(`[OfferingsScreen] Loaded ${page.length} more offerings`);
      
      const mapped: Row[] = page.map((o) => ({
        ...o,
        priceNum: Number(o.price ?? 0),
        mua: muaMap[o.mua_id],
      }));
      
      setRows((prev) => [...prev, ...mapped]);
      setNextUrl(absolutize(json?.next_page_url));
    } catch (e: any) {
      console.error("[OfferingsScreen] Error loading more:", e);
      
      if (e?.message === "401_UNAUTH") {
        router.replace("/(auth)/login");
      } else {
        Alert.alert("Error", "Gagal memuat data tambahan.");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  // tambahkan jarak jika ada userLoc
  const withDistance = useMemo(() => {
    if (!userLoc) {
      console.log("[OfferingsScreen] No user location, skipping distance calculation");
      return rows.map((r) => ({ ...r, distanceKm: null }));
    }
    
    console.log("[OfferingsScreen] Calculating distances for", rows.length, "offerings");
    return rows.map((r) => {
      const lat = Number(r.mua?.location_lat);
      const lng = Number(r.mua?.location_lng);
      const ok = Number.isFinite(lat) && Number.isFinite(lng);
      const d = ok ? haversineKm(userLoc.lat, userLoc.lng, lat, lng) : null;
      return { ...r, distanceKm: d };
    });
  }, [rows, userLoc]);

  // search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      console.log("[OfferingsScreen] No search query, showing all", withDistance.length, "offerings");
      return withDistance;
    }
    
    const filteredList = withDistance.filter((r) => {
      const nm = r.name_offer?.toLowerCase() || "";
      const mua = r.mua?.name?.toLowerCase() || "";
      const tp = r.makeup_type?.toLowerCase() || "";
      return nm.includes(q) || mua.includes(q) || tp.includes(q);
    });
    
    console.log(`[OfferingsScreen] Search "${q}" found ${filteredList.length} results`);
    return filteredList;
  }, [withDistance, query]);

  // sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    console.log(`[OfferingsScreen] Sorting ${arr.length} items by:`, sort);
    
    if (sort === "distance") {
      arr.sort((a, b) => {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        return da - db;
      });
    } else if (sort === "priceAsc") {
      arr.sort((a, b) => (a.priceNum || 0) - (b.priceNum || 0));
    } else if (sort === "priceDesc") {
      arr.sort((a, b) => (b.priceNum || 0) - (a.priceNum || 0));
    }
    
    return arr;
  }, [filtered, sort]);

  function renderItem({ item }: { item: Row }) {
    const title = item.name_offer || "Tanpa Judul";
    const muaName = item.mua?.name || "MUA";
    const typeLabel = toTitle(item.makeup_type) || "Make Up";
    const price = item.priceNum > 0 ? formatIDR(item.priceNum) : "Harga belum tersedia";

    const distanceText =
      typeof item.distanceKm === "number"
        ? item.distanceKm >= 100
          ? `${Math.round(item.distanceKm)} km`
          : `${item.distanceKm.toFixed(1)} km`
        : undefined;

    // Handle MUA photo
    const muaPhoto = item.mua?.photo_url ? 
      (item.mua.photo_url.startsWith("http") ? item.mua.photo_url : `${API_BASE}${item.mua.photo_url}`) 
      : null;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() =>
          router.push({ pathname: "/(user)/offerings/[id]", params: { id: String(item.id) } })
        }
      >
        <View style={styles.card}>
          <View style={styles.cardInner}>
            {/* MUA Photo */}
            {muaPhoto ? (
              <Image source={{ uri: muaPhoto }} style={styles.muaPhoto} />
            ) : (
              <View style={styles.muaPhotoPlaceholder}>
                <Ionicons name="person" size={20} color={TEXT_MUTED} />
              </View>
            )}
            
            <View style={{ flex: 1, paddingLeft: 12, paddingRight: 12 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.cardSub}>{muaName}</Text>
              <Text style={styles.cardType}>{typeLabel}</Text>
            </View>
            
            <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
              <Text style={styles.cardPrice}>{price}</Text>
              {distanceText ? (
                <View style={styles.distanceBadge}>
                  <Ionicons name="location" size={12} color={PURPLE} />
                  <Text style={styles.distance}>{distanceText}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Daftar Jasa</Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={TEXT_MUTED} style={{ marginLeft: 10 }} />
        <TextInput
          placeholder="Cari jasa, MUA, atau jenis makeup..."
          placeholderTextColor={TEXT_MUTED}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter((v) => !v)}>
          <Text style={{ fontWeight: "700" }}>Filter</Text>
          <Ionicons name="chevron-down" size={16} />
        </TouchableOpacity>
      </View>

      {showFilter && (
        <View style={styles.filterMenu}>
          <Text style={styles.filterLabel}>Urutkan:</Text>

          <TouchableOpacity
            style={styles.filterRow}
            onPress={() => { setSort("distance"); setShowFilter(false); }}
          >
            <Ionicons
              name={sort === "distance" ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={sort === "distance" ? PURPLE : TEXT_MUTED}
            />
            <Text style={[styles.filterText, sort === "distance" && styles.filterActiveText]}>
              Terdekat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterRow}
            onPress={() => { setSort("priceAsc"); setShowFilter(false); }}
          >
            <Ionicons
              name={sort === "priceAsc" ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={sort === "priceAsc" ? PURPLE : TEXT_MUTED}
            />
            <Text style={[styles.filterText, sort === "priceAsc" && styles.filterActiveText]}>
              Harga Termurah
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterRow}
            onPress={() => { setSort("priceDesc"); setShowFilter(false); }}
          >
            <Ionicons
              name={sort === "priceDesc" ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={sort === "priceDesc" ? PURPLE : TEXT_MUTED}
            />
            <Text style={[styles.filterText, sort === "priceDesc" && styles.filterActiveText]}>
              Harga Termahal
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={styles.loadingText}>Memuat daftar jasa...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={TEXT_MUTED} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.retryButtonText}>Login Kembali</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={64} color={TEXT_MUTED} />
              <Text style={styles.emptyText}>
                {query ? "Tidak ada jasa yang sesuai dengan pencarian" : "Belum ada jasa tersedia"}
              </Text>
            </View>
          }
          ListFooterComponent={
            nextUrl ? (
              <TouchableOpacity style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator color={PURPLE} />
                ) : (
                  <>
                    <Text style={{ fontWeight: "700", color: PURPLE }}>Muat Lebih Banyak</Text>
                    <Ionicons name="arrow-down" size={16} color={PURPLE} />
                  </>
                )}
              </TouchableOpacity>
            ) : sorted.length > 0 ? (
              <Text style={styles.endOfList}>— Sudah sampai akhir —</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

/* =============== Styles =============== */
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#fff", 
    paddingTop: Platform.select({ ios: 12, android: 8 }) 
  },
  title: { 
    fontSize: 32, 
    fontWeight: "800", 
    marginHorizontal: 20, 
    marginBottom: 12, 
    color: "#111827" 
  },

  searchWrap: {
    height: 44,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  searchInput: { 
    flex: 1, 
    paddingHorizontal: 10, 
    color: "#111",
    fontSize: 16,
  },

  filterBtn: {
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  filterMenu: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    elevation: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  filterLabel: { 
    fontSize: 12, 
    color: TEXT_MUTED, 
    marginBottom: 4 
  },
  filterRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    paddingVertical: 6 
  },
  filterText: { 
    fontSize: 14, 
    color: "#111827" 
  },
  filterActiveText: { 
    color: PURPLE, 
    fontWeight: "800" 
  },

  card: { 
    backgroundColor: CARD_BG, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: BORDER 
  },
  cardInner: { 
    padding: 16, 
    flexDirection: "row",
    alignItems: "center",
  },
  muaPhoto: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  muaPhotoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: "800", 
    color: "#111827",
    lineHeight: 20,
  },
  cardSub: { 
    color: TEXT_MUTED, 
    marginTop: 4,
    fontSize: 14,
  },
  cardType: { 
    color: TEXT_MUTED, 
    marginTop: 2, 
    fontSize: 12,
  },
  cardPrice: { 
    fontWeight: "800", 
    color: "#111827", 
    fontSize: 16,
    textAlign: "right",
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  distance: { 
    color: PURPLE, 
    fontSize: 12,
    fontWeight: "600",
  },

  loadMore: {
    marginTop: 12,
    marginBottom: 20,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fff",
  },
  endOfList: {
    textAlign: "center",
    color: TEXT_MUTED,
    marginVertical: 20,
    fontSize: 14,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: TEXT_MUTED,
    fontSize: 16,
  },

  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  errorText: {
    color: TEXT_MUTED,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: PURPLE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    color: TEXT_MUTED,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
});