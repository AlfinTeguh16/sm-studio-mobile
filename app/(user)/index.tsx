// app/(user)/index.tsx
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
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";



/* ---------- Types ---------- */
type MuaApi = {
  id: string;
  name: string;
  location_lat: string;
  location_lng: string;
  address: string;
  photo_url: string;
};
type Mua = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  photo: string;
  distanceKm?: number;
};
type Offering = {
  id: string;
  title: string;
  vendor: string;
  price?: number;
  category?: string;
};

/* ---------- Consts ---------- */
const PURPLE = "#AA60C8";
const CARD_BG = "#F7F2FA";
const API_BASE = "https://smstudio.my.id/api";
const API_NEARBY = `${API_BASE}/mua-location`;
const API_OFFERINGS = `${API_BASE}/offerings`;

/* ---------- Helpers ---------- */
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
  return new Intl.NumberFormat("id-ID").format(v);
}

// lokasi yang lebih robust: izin, lastKnown, current (timeout)
function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Location timeout")), ms)),
  ]);
}

async function getSafeUserCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted" || !enabled) return null;

    // coba last known dulu (cepat)
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };

    // lalu minta current position, tanpa maximumAge/timeout di options
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        // mayShowUserSettingsDialog: true, // opsional (Android)
      }),
      10000 // timeout manual 10 detik
    );

    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/* ======================= Screen ======================= */
export default function UserDashboard() {
  const router = useRouter();

  // Greeting
  const [displayName, setDisplayName] = useState<string>("");

  // Search
  const [query, setQuery] = useState("");

  // Nearby MUA
  const [nearby, setNearby] = useState<Mua[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);

  // Offerings
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offeringsLoading, setOfferingsLoading] = useState(true);

  // User coords
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

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

  /* --- Ambil nama user: SecureStore -> /auth/me -> fallback /mua-location --- */
  useEffect(() => {
    (async () => {
      try {
        const authStr = await SecureStore.getItemAsync("auth");
        if (authStr) {
          const auth = JSON.parse(authStr || "{}");
          const nm = auth?.user?.name || auth?.profile?.name;
          if (nm) {
            setDisplayName(String(nm));
            return;
          }
          if (auth?.token) {
            const res = await fetch(`${API_BASE}/auth/me`, {
              headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
            });
            if (res.ok) {
              const me = await res.json();
              const n2 = me?.name || me?.profile?.name;
              if (n2) {
                setDisplayName(String(n2));
                return;
              }
            }
          }
        }
      } catch {}
      try {
        const res = await fetch(API_NEARBY);
        const json = await res.json();
        const first = Array.isArray(json?.data) && json.data.length > 0 ? json.data[0] : null;
        if (first?.name) setDisplayName(String(first.name));
      } catch {}
    })();
  }, []);

  /* --- Fetch MUA + lokasi aman + validasi jarak --- */
  useEffect(() => {
    (async () => {
      try {
        // 1) Fetch data MUA
        const res = await fetch(API_NEARBY);
        const json = await res.json();
        const raw: Mua[] = (json?.data as MuaApi[]).map((x) => ({
          id: x.id,
          name: x.name,
          address: x.address,
          lat: Number(x.location_lat),
          lng: Number(x.location_lng),
          photo: x.photo_url,
        }));

        // 2) Lokasi user
        let coords = await getSafeUserCoords();
        // 3) Validasi lokasi tidak masuk akal: jika min jarak ke semua MUA > 3000km → abaikan
        if (coords) {
          const distances = raw.map((m) => haversine(coords!.lat, coords!.lng, m.lat, m.lng));
          const minKm = Math.min(...distances);
          if (!Number.isFinite(minKm) || minKm > 3000) {
            coords = null;
          }
        }
        setUserCoords(coords ?? null);

        // 4) Hitung jarak & urutkan jika coords valid
        const rows = coords
          ? raw
              .map((m) => ({ ...m, distanceKm: haversine(coords!.lat, coords!.lng, m.lat, m.lng) }))
              .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
          : raw;

        setNearby(rows);
      } catch (e) {
        console.warn("nearby fetch error:", e);
        setNearby([]);
      } finally {
        setNearbyLoading(false);
      }
    })();
  }, []);

  /* --- Fetch offerings --- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_OFFERINGS);
        const json = await res.json();
        const items: Offering[] = (json?.data ?? json ?? []).map((x: any) => ({
          id: String(x.id ?? x.uuid ?? Math.random()),
          title: x.title ?? x.name ?? x.package_name ?? "Tanpa Judul",
          vendor: x.vendor?.name ?? x.mua?.name ?? x.user?.name ?? x.owner?.name ?? "—",
          price: safeNum(x.price ?? x.base_price ?? x.amount ?? x.cost),
          category: x.category ?? x.type ?? undefined,
        }));
        setOfferings(items);
      } catch (e) {
        console.warn("offerings fetch error:", e);
        setOfferings([]);
      } finally {
        setOfferingsLoading(false);
      }
    })();
  }, []);

  /* --- Pencarian --- */
  const filteredNearby = useMemo(() => {
    if (!query) return nearby;
    const q = query.toLowerCase();
    return nearby.filter((m) => `${m.name} ${m.address}`.toLowerCase().includes(q));
  }, [query, nearby]);

  return (

    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 36 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.hello}>
          Hello, <Text style={{ fontWeight: "800" }}>{displayName || "User"}</Text>
        </Text>
        <TouchableOpacity onPress={() => router.push("/(user)/notifications")} style={styles.bell}>
          <Ionicons name="notifications-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#9CA3AF" style={{ marginHorizontal: 8 }} />
        <TextInput placeholder="Search" style={styles.search} value={query} onChangeText={setQuery} returnKeyType="search" />
      </View>

      {/* MUA Disekitar (horizontal) */}
      <Section title="MUA Disekitar">
        {nearbyLoading ? (
          <ActivityIndicator style={{ marginVertical: 8 }} />
        ) : nearby.length === 0 ? (
          <Text style={{ color: "#6B7280" }}>Belum ada data.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
            {nearby.map((m, idx) => (
              <View key={m.id} style={[styles.nearCard, { marginLeft: idx === 0 ? 0 : 14 }]}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image source={{ uri: m.photo }} style={styles.nearPhoto} />
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
                <TouchableOpacity style={styles.nearBtn} onPress={() => router.push("/(user)/profile")}>
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
          <MapView
            style={styles.mapBox}
            showsUserLocation={!!userCoords}
            initialRegion={{
              latitude: userCoords?.lat ?? nearby[0]?.lat ?? -6.2,
              longitude: userCoords?.lng ?? nearby[0]?.lng ?? 106.8,
              latitudeDelta: 0.25,
              longitudeDelta: 0.25,
            }}
          >
            {nearby.map((m) => (
              <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.name} description={m.address} />
            ))}
          </MapView>
        )}
        {!userCoords && (
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 6 }}>
            Aktifkan layanan lokasi agar hasil lebih akurat.
          </Text>
        )}
      </Section>

      {/* List MUA vertikal */}
      <Section
        title="Temukan MUA"
        rightAction={
          <TouchableOpacity style={styles.more} onPress={() => router.push("/(user)/index")}>
            <Text style={styles.moreText}>Lebih Banyak</Text>
            <Ionicons name="arrow-forward" size={14} color="#6B7280" />
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
          {filteredNearby.map((m) => (
            <View key={m.id} style={[styles.listCard, { marginBottom: 10 }]}>
              <Image source={{ uri: m.photo }} style={styles.avatar} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.listTitle}>{m.name}</Text>
                <Text style={styles.listAddress} numberOfLines={2}>
                  {m.address}
                </Text>
                {typeof m.distanceKm === "number" && (
                  <Text style={styles.listCategory}>{formatKm(m.distanceKm)} dari Anda</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </Section>

      {/* Offerings */}
      <Section
        title="Temukan Jasa"
        rightAction={
          <TouchableOpacity style={styles.more} onPress={() => router.push("/(user)/offerings")}>
            <Text style={styles.moreText}>Lebih Banyak</Text>
            <Ionicons name="arrow-forward" size={14} color="#6B7280" />
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
            offerings.map((s) => (
              <View key={s.id} style={[styles.serviceCard, { marginBottom: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceTitle}>{s.title}</Text>
                  <Text style={styles.serviceMeta}>{s.vendor}</Text>
                  {s.category ? <Text style={styles.serviceCategory}>{s.category}</Text> : null}
                </View>
                {isFiniteNumber(s.price) ? (
                  <Text style={styles.price}>IDR {formatIDR(s.price!)}</Text>
                ) : (
                  <Text style={[styles.price, { color: "#6B7280" }]}>—</Text>
                )}
              </View>
            ))
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
              const sorted = [...nearby].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
              setNearby(sorted);
              closeFilter();
            }}
          >
            <Ionicons name="location-outline" size={18} color="#111827" />
            <Text style={styles.sheetItemText}>Terdekat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              const sorted = [...nearby].sort((a, b) => a.name.localeCompare(b.name));
              setNearby(sorted);
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

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { fontSize: 26, fontWeight: "600", color: "#111827" },
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
  listTitle: { fontWeight: "700", color: "#111827" },
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
});
