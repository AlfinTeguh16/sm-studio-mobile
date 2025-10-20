// app/(user)/(tabs)/index.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  Animated,
  Easing,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Region } from "react-native-maps";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { useUserLocation } from "../../providers/LocationProvider";

/* ---------- Types ---------- */
type MuaApi = {
  id: string;
  role?: string | null;
  name?: string | null;
  location_lat?: string | number | null;
  location_lng?: string | number | null;
  address?: string | null;
  photo_url?: string | null;
  services?: string | string[] | null;
  is_online?: number | boolean | null;
  phone?: string | null;
  created_at?: string | null;
};

type Mua = {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  photo: string; // URL absolut / placeholder
  distanceKm?: number;
  services?: string[] | null;
  is_online?: boolean;
  phone?: string | null;
};

type OfferingApi = {
  id: number | string;
  mua_id: string;
  name_offer: string;
  price?: string | number;
  makeup_type?: string | null;
};
type Offering = {
  id: string;
  title: string;
  vendor: string;
  mua_id?: string;
  price?: number;
  category?: string;
  distanceKm?: number;
};

/* ---------- Consts ---------- */
const PURPLE = "#AA60C8";
const CARD_BG = "#F7F2FA";
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_MUAS = `${API_BASE}/mua`;
const API_OFFERINGS = `${API_BASE}/offerings`;
const PLACEHOLDER_AVATAR = "https://via.placeholder.com/96x96.png?text=MUA";

/* ---------- Helpers ---------- */
type HeaderMap = Record<string, string>;

async function getAuthToken(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync("auth");
    if (!raw) return null;
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

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
function isFiniteNumber(n?: number) {
  return typeof n === "number" && Number.isFinite(n);
}
function safeNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function formatIDR(v: number) {
  try {
    return new Intl.NumberFormat("id-ID").format(v);
  } catch {
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
}

/** Normalisasi foto_url ke URL absolut (atau placeholder) */
function resolvePhotoUrl(u?: string | null): string {
  if (!u) return PLACEHOLDER_AVATAR;
  const s = String(u);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return `${API_ORIGIN}${s}`;
  if (s.startsWith("storage/")) return `${API_ORIGIN}/${s}`;
  return `${API_ORIGIN}/${s.replace(/^\/+/, "")}`;
}

/** Parse services (stringified JSON or CSV) */
function parseServices(s?: string | string[] | null): string[] | null {
  if (!s) return null;
  if (Array.isArray(s)) return s;
  try {
    const parsed = JSON.parse(s as string);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return (s as string)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** safe Region helper untuk MapView (hindari NaN) */
function makeSafeRegion(lat: number, lng: number): Region {
  const latOk = Number.isFinite(lat) ? lat : -6.2;
  const lngOk = Number.isFinite(lng) ? lng : 106.8;
  return {
    latitude: latOk,
    longitude: lngOk,
    latitudeDelta: 0.25,
    longitudeDelta: 0.25,
  };
}

/** Gambar dengan fallback aman (tanpa mutasi objek MUA) */
function Img({
  uri,
  style,
  fallback = PLACEHOLDER_AVATAR,
}: {
  uri?: string | null;
  style: any;
  fallback?: string;
}) {
  const [ok, setOk] = useState(true);
  const src = useMemo(() => (ok && uri ? { uri } : { uri: fallback }), [ok, uri, fallback]);
  return <Image source={src} style={style} onError={() => setOk(false)} />;
}

/* ======================= Screen ======================= */
export default function UserDashboard() {
  const router = useRouter();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // use location from provider
  const { coords: userCoords, loading: userLocLoading, error, refresh } = useUserLocation();

  // Greeting
  const [displayName, setDisplayName] = useState<string>("");

  // Search
  const [query, setQuery] = useState("");

  // All MUA (includes ones without coords)
  const [allMua, setAllMua] = useState<Mua[]>([]);
  const baseMuaRef = useRef<Mua[]>([]); // store raw normalized list for recompute when userCoords changes
  const [nearbyLoading, setNearbyLoading] = useState(true);
  const [muaMap, setMuaMap] = useState<Record<string, Mua>>({});

  // Offerings
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offeringsLoading, setOfferingsLoading] = useState(true);

  // Bottom sheet
  const [filterOpen, setFilterOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [260, 0] });
  const openFilter = () => {
    setFilterOpen(true);
    requestAnimationFrame(() =>
      Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    );
  };
  const closeFilter = () =>
    Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => finished && setFilterOpen(false)
    );

  /* --- Ambil nama user: SecureStore -> /auth/me -> fallback /mua --- */
  useEffect(() => {
    (async () => {
      try {
        const authStr = await SecureStore.getItemAsync("auth");
        if (authStr) {
          const auth = JSON.parse(authStr || "{}");
          const nm = auth?.user?.name || auth?.profile?.name;
          if (nm && mountedRef.current) {
            setDisplayName(String(nm));
            return;
          }
          if (auth?.token) {
            const me = await safeFetchJSON<any>(`${API_BASE}/auth/me`, {
              headers: { Authorization: `Bearer ${auth.token}` },
            });
            const n2 = me?.name || me?.profile?.name;
            if (n2 && mountedRef.current) {
              setDisplayName(String(n2));
              return;
            }
          }
        }
      } catch {}
      try {
        const data = await safeFetchJSON<{ data?: MuaApi[] } | MuaApi[]>(API_MUAS);
        const list: MuaApi[] = (data as any)?.data ?? (data as MuaApi[]) ?? [];
        const first = list[0];
        if (first?.name && mountedRef.current) setDisplayName(String(first.name));
      } catch {}
    })();
  }, []);

  /* --- Fetch MUA (only) --- */
  useEffect(() => {
    let alive = true;
    (async () => {
      setNearbyLoading(true);
      try {
        const headers = await getAuthHeaders();
        const json = await safeFetchJSON<{ data?: MuaApi[] } | MuaApi[]>(API_MUAS, { headers });
        const arr: MuaApi[] = (json as any)?.data ?? (json as MuaApi[]) ?? [];

        const onlyMua = arr.filter((x) => String(x.role ?? "").toLowerCase() === "mua");

        const normalized: Mua[] = onlyMua.map((x) => {
          const lat = toNumber(x.location_lat);
          const lng = toNumber(x.location_lng);
          return {
            id: String(x.id),
            name: String(x.name ?? "MUA"),
            address: x.address ?? "-",
            lat: lat == null ? undefined : lat,
            lng: lng == null ? undefined : lng,
            photo: resolvePhotoUrl(x.photo_url),
            services: parseServices(x.services),
            is_online: x.is_online === 1 || x.is_online === true,
            phone: x.phone ?? null,
          } as Mua;
        });

        // store base list (without distances) for recompute later
        baseMuaRef.current = normalized;

        // build map
        const mmap: Record<string, Mua> = {};
        normalized.forEach((m) => (mmap[m.id] = m));
        if (alive && mountedRef.current) setMuaMap(mmap);

        // if userCoords already available, compute distances immediately
        if (userCoords) {
          const rows = normalized
            .map((m) => {
              if (isFiniteNumber(m.lat!) && isFiniteNumber(m.lng!)) {
                const d = haversine(userCoords.lat, userCoords.lng, m.lat!, m.lng!);
                return { ...m, distanceKm: d };
              }
              return { ...m, distanceKm: undefined };
            })
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
          if (alive && mountedRef.current) setAllMua(rows);
        } else {
          // set as-is; distances will be computed in separate effect when userCoords becomes available
          if (alive && mountedRef.current) setAllMua(normalized);
        }
      } catch {
        if (alive && mountedRef.current) setAllMua([]);
      } finally {
        if (alive && mountedRef.current) setNearbyLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount; userCoords handled in separate effect below

  /* --- Recompute distances when userCoords becomes available --- */
  useEffect(() => {
    if (!userCoords) return;
    // recompute using baseMuaRef (original normalized list)
    const normalized = baseMuaRef.current ?? [];
    if (normalized.length === 0) return;
    const rows = normalized
      .map((m) => {
        if (isFiniteNumber(m.lat!) && isFiniteNumber(m.lng!)) {
          const d = haversine(userCoords.lat, userCoords.lng, m.lat!, m.lng!);
          return { ...m, distanceKm: d };
        }
        return { ...m, distanceKm: undefined };
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    if (mountedRef.current) setAllMua(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCoords]);

  /* --- Fetch offerings (gabungkan nama MUA dari muaMap jika ada) --- */
  useEffect(() => {
    let alive = true;
    (async () => {
      setOfferingsLoading(true);
      try {
        const headers = await getAuthHeaders();
        const json = await safeFetchJSON<{ data?: OfferingApi[] } | OfferingApi[]>(API_OFFERINGS, { headers });
        const list: OfferingApi[] = (json as any)?.data ?? (json as OfferingApi[]) ?? [];
        const items: Offering[] = list.map((x) => ({
          id: String(x.id),
          title: x.name_offer ?? "Tanpa Judul",
          vendor: muaMap[x.mua_id]?.name || "MUA",
          mua_id: x.mua_id,
          price: safeNum(x.price),
          category: x.makeup_type ?? undefined,
        }));
        if (alive && mountedRef.current) setOfferings(items);
      } catch {
        if (alive && mountedRef.current) setOfferings([]);
      } finally {
        if (alive && mountedRef.current) setOfferingsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [muaMap]);

  /* --- Pencarian --- */
  const filteredNearby = useMemo(() => {
    if (!query) return allMua;
    const q = query.toLowerCase();
    return allMua.filter((m) => `${m.name} ${m.address ?? ""} ${m.services?.join(" ") ?? ""}`.toLowerCase().includes(q));
  }, [query, allMua]);

  // Batasi ke 5 terdekat untuk section "Temukan MUA"
  const findList = useMemo(() => {
    const copy = [...filteredNearby];
    copy.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return copy.slice(0, 5);
  }, [filteredNearby]);

  // Hitung jarak tiap offering berdasarkan lokasi MUA (via muaMap) and userCoords, lalu ambil 5 terdekat
  const findOfferings = useMemo(() => {
    if (!offerings || offerings.length === 0) return [];
    const withDist = offerings.map((of) => {
      const mua = of.mua_id ? muaMap[of.mua_id] : undefined;
      const lat = mua && isFiniteNumber(mua.lat ?? NaN) ? (mua.lat as number) : undefined;
      const lng = mua && isFiniteNumber(mua.lng ?? NaN) ? (mua.lng as number) : undefined;
      if (userCoords && lat != null && lng != null) {
        const d = haversine(userCoords.lat, userCoords.lng, lat, lng);
        return { ...of, distanceKm: d };
      }
      return { ...of, distanceKm: undefined };
    });
    withDist.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return withDist.slice(0, 5);
  }, [offerings, muaMap, userCoords]);

  // Region aman untuk MapView (hindari NaN)
  const safeRegion = useMemo(
    () =>
      makeSafeRegion(
        userCoords?.lat ?? (allMua.find((m) => isFiniteNumber(m.lat ?? NaN))?.lat ?? -6.2) as number,
        userCoords?.lng ?? (allMua.find((m) => isFiniteNumber(m.lng ?? NaN))?.lng ?? 106.8) as number
      ),
    [userCoords, allMua]
  );

  // Marker hanya untuk koordinat valid (double guard)
  const nearbyForMarkers = useMemo(
    () => allMua.filter((m) => isFiniteNumber(m.lat ?? NaN) && isFiniteNumber(m.lng ?? NaN)),
    [allMua]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 36 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.hello}>
          Hello, <Text style={{ fontWeight: "600" }}>{displayName || "User"}</Text>
        </Text>
        <TouchableOpacity onPress={() => router.push("/(user)/notifications/")} style={styles.bell}>
          <Ionicons name="notifications-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#9CA3AF" style={{ marginHorizontal: 8 }} />
        <TextInput
          placeholder="Cari MUA, alamat, atau layanan"
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      {/* MUA Disekitar (horizontal) */}
      <Section title="MUA Disekitar">
        {nearbyLoading ? (
          <ActivityIndicator style={{ marginVertical: 8 }} />
        ) : allMua.length === 0 ? (
          <Text style={{ color: "#6B7280" }}>Belum ada data.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
            {allMua.map((m, idx) => (
              <View key={m.id} style={[styles.nearCard, { marginLeft: idx === 0 ? 0 : 14 }]}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Img uri={m.photo} style={styles.nearPhoto} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.nearTitle} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={styles.nearAddress} numberOfLines={2}>
                      {m.address}
                    </Text>
                  </View>
                </View>

                {typeof m.distanceKm === "number" && (
                  <Text style={styles.distanceText}>{formatKm(m.distanceKm)} dari lokasi Anda</Text>
                )}

                {m.services && m.services.length > 0 && (
                  <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 6 }}>{m.services.slice(0, 3).join(", ")}</Text>
                )}

                <TouchableOpacity
                  style={styles.nearBtn}
                  onPress={() => router.push({ pathname: "/(user)/mua/[id]", params: { id: m.id } })}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Detail</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </Section>

      {/* Peta dengan marker */}
      <Section title="Temukan MUA Di Sekitar">
        {nearbyLoading ? (
          <View style={[styles.mapBox, { backgroundColor: "#EEE" }]} />
        ) : (
          <MapView style={styles.mapBox} showsUserLocation={!!userCoords} initialRegion={safeRegion}>
            {nearbyForMarkers.map((m) => (
              <Marker
                key={m.id}
                coordinate={{ latitude: m.lat as number, longitude: m.lng as number }}
                title={m.name ?? undefined}
                description={m.address ?? undefined}
                onPress={() => router.push({ pathname: "/(user)/mua/[id]", params: { id: m.id } })}
              />
            ))}
          </MapView>
        )}
        {!userCoords && (
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 6 }}>
            Aktifkan layanan lokasi agar hasil lebih akurat.
          </Text>
        )}
      </Section>

      {/* List MUA vertikal (5 terdekat) */}
      <Section
        title="Temukan MUA"
        rightAction={
          <TouchableOpacity style={styles.more} onPress={() => router.push("/(user)/(tabs)/mua")}>
            <Text style={styles.moreText}>Lihat Semua</Text>
          </TouchableOpacity>
        }
        leftAction={
          <TouchableOpacity style={styles.filterBtn} onPress={openFilter}>
            <Text style={styles.filterText}>Filter</Text>
            <Ionicons name="chevron-down" size={14} color="#111827" />
          </TouchableOpacity>
        }
      >
        <View style={{ paddingRight: 20 }}>
          <Text style={{ color: "#6B7280", fontSize: 12, marginBottom: 8 }}>Menampilkan 5 terdekat</Text>
          {findList.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.listCard, { marginBottom: 10 }]}
              onPress={() => router.push({ pathname: "/(user)/mua/[id]", params: { id: m.id } })}
              activeOpacity={0.8}
            >
              <Img uri={m.photo} style={styles.avatar} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.listTitle}>{m.name}</Text>
                  {m.is_online ? <View style={styles.onlineDotSmall} /> : null}
                </View>
                <Text style={styles.listAddress} numberOfLines={2}>
                  {m.address}
                </Text>
                {typeof m.distanceKm === "number" && (
                  <Text style={styles.listCategory}>{formatKm(m.distanceKm)} dari Anda</Text>
                )}
                {m.services && m.services.length > 0 ? (
                  <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 6 }}>{m.services.slice(0, 3).join(", ")}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {/* Temukan Jasa (5 terdekat) */}
      <Section
        title="Temukan Jasa"
        rightAction={
          <TouchableOpacity style={styles.more} onPress={() => router.push("/(user)/(tabs)/offerings")}>
            <Text style={styles.moreText}>Lebih Banyak</Text>
          </TouchableOpacity>
        }
        leftAction={
          <TouchableOpacity style={styles.filterBtn} onPress={openFilter}>
            <Text style={styles.filterText}>Filter</Text>
            <Ionicons name="chevron-down" size={14} color="#111827" />
          </TouchableOpacity>
        }
      >
        <View style={{ paddingRight: 20 }}>
          {offeringsLoading ? (
            <ActivityIndicator style={{ marginVertical: 8 }} />
          ) : offerings.length === 0 ? (
            <Text style={{ color: "#6B7280" }}>Belum ada data.</Text>
          ) : (
            <>
              <Text style={{ color: "#6B7280", fontSize: 12, marginBottom: 8 }}>Menampilkan 5 terdekat</Text>
              {findOfferings.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.serviceCard, { marginBottom: 10 }]}
                  onPress={() => router.push({ pathname: "/(user)/offerings/[id]", params: { id: s.id } })}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTitle}>{s.title}</Text>
                    <Text style={styles.serviceMeta}>{s.vendor}</Text>
                    {s.category ? <Text style={styles.serviceCategory}>{s.category}</Text> : null}
                    {typeof s.distanceKm === "number" ? (
                      <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 6 }}>{formatKm(s.distanceKm)} dari Anda</Text>
                    ) : null}
                  </View>
                  {isFiniteNumber(s.price) ? (
                    <Text style={styles.price}>IDR {formatIDR(s.price!)}</Text>
                  ) : (
                    <Text style={[styles.price, { color: "#6B7280" }]}>—</Text>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </Section>

      {/* Bottom sheet Filter */}
      <Modal visible={filterOpen} transparent animationType="none" onRequestClose={closeFilter}>
        <Pressable style={styles.backdrop} onPress={closeFilter} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Filter</Text>

          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              const sorted = [...allMua].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
              setAllMua(sorted);
              closeFilter();
            }}
          >
            <Ionicons name="location-outline" size={18} color="#111827" />
            <Text style={styles.sheetItemText}>Terdekat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              const sorted = [...allMua].sort((a, b) => a.name.localeCompare(b.name));
              setAllMua(sorted);
              closeFilter();
            }}
          >
            <Ionicons name="filter-outline" size={18} color="#111827" />
            <Text style={styles.sheetItemText}>Nama (A–Z)</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </ScrollView>
  );
}

/* ---------- Reusable Section ---------- */
function Section({
  title,
  children,
  rightAction,
  leftAction,
}: {
  title: string;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
  leftAction?: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>{rightAction}</View>
      </View>
      {leftAction ? <View style={{ marginBottom: 10 }}>{leftAction}</View> : null}
      {children}
    </View>
  );
}

/* ---------- Styles (sama seperti sebelumnya) ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    gap: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { fontSize: 20, fontWeight: "600", color: "#111827", flexWrap: "wrap", flex: 1, marginRight: 10 },
  bell: { backgroundColor: PURPLE, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  searchWrap: {
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  search: { flex: 1, paddingRight: 10, fontSize: 14 },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 8 },

  nearCard: {
    width: 280,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    borderRadius: 12,
  },
  nearPhoto: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#eee" },
  nearTitle: { fontWeight: "700", color: "#111827" },
  nearAddress: { color: "#6B7280", fontSize: 12, lineHeight: 18 },
  distanceText: { color: "#6B7280", fontSize: 12, marginTop: 6 },
  nearBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: PURPLE,
    borderRadius: 10,
  },

  mapBox: { height: 190, borderRadius: 14, overflow: "hidden" },

  filterBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  filterText: { fontWeight: "700", color: "#111827", marginRight: 6 },

  listCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  avatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#eee" },
  listTitle: { fontWeight: "700", color: "#111827", flex: 1 },
  listAddress: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  listCategory: { color: "#6B7280", fontSize: 12, marginTop: 2 },

  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  serviceTitle: { fontWeight: "700", color: "#111827" },
  serviceMeta: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  serviceCategory: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  price: { fontWeight: "700", color: "#111827" },

  more: { flexDirection: "row", alignItems: "center" },
  moreText: { color: "#6B7280", fontWeight: "600", marginRight: 6 },

  // bottom sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  grabber: { alignSelf: "center", width: 48, height: 5, backgroundColor: "#E5E7EB", borderRadius: 3, marginBottom: 10 },
  sheetTitle: { fontWeight: "800", fontSize: 16, marginBottom: 6, textAlign: "center" },
  sheetItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  sheetItemText: { fontWeight: "600", color: "#111827", marginLeft: 10 },

  onlineDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: "#4ADE80",
    marginLeft: 8,
  },
});
