import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import authStorage from "../../../../utils/authStorage"; 

/* ================= Types ================= */
type MuaProfile = {
  id: string;
  role?: string | null;
  name: string;
  phone?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  services?: string | string[] | null;
  location_lat?: number | string | null;
  location_lng?: number | string | null;
  address?: string | null;
  is_online?: number | boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  starting_price?: number | null;
  min_price?: number | null;
  lowest_service_price?: number | null;
  price_from?: number | null;
};

type ApiList<T> = {
  data?: T[];
  meta?: { current_page?: number; last_page?: number };
} | T[];

/* ================ Consts & UI ================ */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_MUAS = `${API_BASE}/mua`;
const PAGE_SIZE = 20;

const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";
const CARD_BG = "#FFFFFF";
const ACCENT_BG = "#EEE3FA";
const ACCENT_TXT = "#6D3FA8";

type HeaderMap = Record<string, string>;
type FilterKey = "nearest" | "cheapest" | "expensive" | "newest";

/* ================ Helpers ================================ */
// ✅ GUNAKAN AUTH STORAGE YANG SAMA DENGAN APP LAIN
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

async function safeFetchJSON<T = any>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
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
      throw error; // Re-throw auth errors
    }
    console.warn("[safeFetchJSON] Network error:", error);
    throw new Error("Network error: " + (error instanceof Error ? error.message : String(error)));
  }
}

/** Haversine {km} */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sLat1 = (a.lat * Math.PI) / 180;
  const sLat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(sLat1) * Math.cos(sLat2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatIDR(n: number) {
  return n.toLocaleString("id-ID");
}

function getPrice(m: MuaProfile): number | null {
  if (typeof m.starting_price === "number") return m.starting_price;
  if (typeof m.min_price === "number") return m.min_price;
  if (typeof m.lowest_service_price === "number") return m.lowest_service_price;
  if (typeof m.price_from === "number") return m.price_from;
  return null;
}

function parseServices(s?: string | string[] | null): string[] | null {
  if (!s) return null;
  if (Array.isArray(s)) return s;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolvePhotoUrl(photo?: string | null) {
  if (!photo) return null;
  if (photo.startsWith("http://") || photo.startsWith("https://")) return photo;
  if (photo.startsWith("/")) return `${API_ORIGIN}${photo}`;
  return `${API_ORIGIN}/${photo}`;
}

function initialsFromName(name?: string | null) {
  if (!name) return "M";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (
    (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase()
  );
}

/* ================ Screen ================================ */
export default function MuaListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<MuaProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  // UX/filter
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("nearest");

  // user location
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locDenied, setLocDenied] = useState<boolean>(false);

  // === Lokasi robust ===
  const requestLocation = useCallback(async () => {
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setLocDenied(true);
        setUserLoc(null);
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocDenied(true);
        setUserLoc(null);
        return;
      }

      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        setUserLoc({ lat: last.coords.latitude, lng: last.coords.longitude });
        setLocDenied(false);
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocDenied(false);
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last?.coords) {
          setUserLoc({ lat: last.coords.latitude, lng: last.coords.longitude });
          setLocDenied(false);
          return;
        }
      } catch {}
      setLocDenied(true);
      setUserLoc(null);
    }
  }, []);

  // ==================== fetchPage ====================
  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      try {
        const headers = await getAuthHeaders();
        const url = `${API_MUAS}?page=${targetPage}&per_page=${PAGE_SIZE}`;
        console.log(`[fetchPage] Fetching page ${targetPage}`);
        
        const json = await safeFetchJSON<any>(url, { headers });

        const rawList: any[] = (json as any)?.data ?? (json as any) ?? [];

        const filtered: MuaProfile[] = rawList.filter(
          (it) => it && String(it.role).toLowerCase() === "mua"
        );

        if (append) {
          setRows((prev) => {
            const map = new Map<string, MuaProfile>();
            prev.forEach((p) => map.set(String(p.id), p));
            filtered.forEach((p) => map.set(String(p.id), p));
            return Array.from(map.values());
          });
        } else {
          setRows(filtered);
        }

        if (
          typeof json.current_page === "number" &&
          typeof json.last_page === "number"
        ) {
          setHasMore(json.current_page < json.last_page);
        } else {
          setHasMore(rawList.length >= PAGE_SIZE);
        }

        setPage(targetPage);
      } catch (error: any) {
        console.error("[fetchPage] Error:", error);
        throw error; // Re-throw to handle in caller
      }
    },
    []
  );

  const initialLoad = useCallback(async () => {
    setLoading(true);
    try {
      await fetchPage(1, false);
    } catch (e: any) {
      if (e?.message === "401_UNAUTH") {
        console.log("[initialLoad] 401 detected - redirecting to login");
        Alert.alert("Sesi berakhir", "Silakan login kembali.", [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(auth)/login");
            }
          }
        ]);
      } else {
        console.warn("[initialLoad] Other error:", e);
        Alert.alert("Error", "Gagal memuat data MUA: " + (e.message || "Unknown error"));
        setRows([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchPage, router]);

  useEffect(() => {
    initialLoad();
    requestLocation();
  }, [initialLoad, requestLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchPage(1, false), requestLocation()]);
    } catch (error: any) {
      if (error?.message === "401_UNAUTH") {
        router.replace("/(auth)/login");
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage, requestLocation, router]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || loading) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, true);
    } catch (error: any) {
      if (error?.message === "401_UNAUTH") {
        router.replace("/(auth)/login");
      }
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [fetchPage, page, hasMore, loading, router]);

  // computed list (search + sort + jarak)
  const computed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = rows;
    if (q) {
      base = base.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.address || "").toLowerCase().includes(q)
      );
    }
    const withDist = base.map((m) => {
      const lat =
        typeof m.location_lat === "number"
          ? m.location_lat
          : typeof m.location_lat === "string" && m.location_lat
          ? Number(m.location_lat)
          : null;
      const lng =
        typeof m.location_lng === "number"
          ? m.location_lng
          : typeof m.location_lng === "string" && m.location_lng
          ? Number(m.location_lng)
          : null;
      let dist: number | null = null;
      if (userLoc && lat != null && lng != null)
        dist = distanceKm(userLoc, { lat, lng });
      return { ...m, _dist: dist, _price: getPrice(m) };
    }) as (MuaProfile & { _dist: number | null; _price: number | null })[];

    const copy = [...withDist];
    switch (filter) {
      case "nearest":
        copy.sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity));
        break;
      case "cheapest":
        copy.sort((a, b) => (a._price ?? Infinity) - (b._price ?? Infinity));
        break;
      case "expensive":
        copy.sort((a, b) => (b._price ?? -Infinity) - (a._price ?? -Infinity));
        break;
      case "newest":
        copy.sort((a, b) => {
          const ca = a.created_at ? Date.parse(a.created_at) : 0;
          const cb = b.created_at ? Date.parse(b.created_at) : 0;
          if (cb !== ca) return cb - ca;
          return String(b.id).localeCompare(String(a.id));
        });
        break;
    }
    return copy;
  }, [rows, query, filter, userLoc]);

  const renderItem = ({
    item,
  }: {
    item: MuaProfile & { _dist: number | null; _price: number | null };
  }) => {
    const addr = item.address || "-";
    const distKm =
      item._dist != null
        ? `${Math.max(0, item._dist).toFixed(1)} km`
        : locDenied
        ? "Lokasi ditolak"
        : "—";

    const photo = resolvePhotoUrl(item.photo_url ?? null);
    const services = parseServices(item.services);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/(user)/mua/${item.id}`)}
      >
        <View style={styles.cardLeft}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>
                {initialsFromName(item.name)}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {item.is_online ? (
              <View style={styles.onlineDot} />
            ) : null}
          </View>

          <Text style={styles.addr} numberOfLines={1}>
            {addr}
          </Text>

          <View style={styles.rowBetween}>
            <View style={styles.badgesRow}>
              <View style={styles.badge}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={ACCENT_TXT}
                />
                <Text style={styles.badgeText}>{distKm}</Text>
              </View>

              {services && services.length > 0 ? (
                <View style={styles.badge}>
                  <Ionicons name="brush" size={14} color={ACCENT_TXT} />
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {services.slice(0, 2).join(", ")}
                  </Text>
                </View>
              ) : null}
            </View>

            <Ionicons name="chevron-forward" size={20} color="#9D61C5" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListFooter = () => {
    if (!loadingMore) {
      if (!hasMore && rows.length > 0) {
        return (
          <Text
            style={{
              textAlign: "center",
              color: TEXT_MUTED,
              paddingVertical: 14,
            }}
          >
            — sudah sampai bawah —
          </Text>
        );
      }
      return null;
    }
    return <ActivityIndicator style={{ marginVertical: 14 }} />;
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Make-Up Artist</Text>

      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Cari MUA atau alamat…"
          placeholderTextColor={TEXT_MUTED}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        <Ionicons
          name="search"
          size={16}
          color={TEXT_MUTED}
          style={{ marginRight: 10 }}
        />
      </View>

      <View style={styles.pills}>
        <FilterPill
          current={filter}
          me="nearest"
          label="Terdekat"
          onPress={() => {
            setFilter("nearest");
            if (!userLoc && !locDenied) requestLocation();
          }}
        />
        <FilterPill
          current={filter}
          me="cheapest"
          label="Termurah"
          onPress={() => setFilter("cheapest")}
        />
        <FilterPill
          current={filter}
          me="expensive"
          label="Termahal"
          onPress={() => setFilter("expensive")}
        />
        <FilterPill
          current={filter}
          me="newest"
          label="Baru bergabung"
          onPress={() => setFilter("newest")}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={computed}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <Text
              style={{ color: TEXT_MUTED, marginTop: 24, textAlign: "center" }}
            >
              MUA belum tersedia.
            </Text>
          }
        />
      )}
    </View>
  );
}

/* ================ Small Components ================ */
function FilterPill({
  current,
  me,
  label,
  onPress,
}: {
  current: FilterKey;
  me: FilterKey;
  label: string;
  onPress: () => void;
}) {
  const active = current === me;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        active && { backgroundColor: ACCENT_BG, borderColor: "#E9DDF7" },
      ]}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.pillText,
          active && { color: ACCENT_TXT, fontWeight: "800" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ================ Styles ================ */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: Platform.select({ ios: 12, android: 8 }),
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginHorizontal: 16,
    marginBottom: 12,
    color: "#111827",
  },
  searchWrap: {
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, paddingHorizontal: 12, color: "#111" },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#fff",
    marginRight: 8,
    marginTop: 6,
  },
  pillText: { color: "#111827" },

  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#EFEFEF",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  cardLeft: {
    marginRight: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F7F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontWeight: "800",
    color: ACCENT_TXT,
    fontSize: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111827", flex: 1 },
  addr: { marginTop: 4, color: TEXT_MUTED },

  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  badge: {
    backgroundColor: "#F7F0FF",
    borderWidth: 1,
    borderColor: "#E9DDF7",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  badgeText: { color: ACCENT_TXT, fontWeight: "700", fontSize: 12 },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: "#4ADE80",
    marginLeft: 8,
  },
});