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
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/* ================= Types ================= */
type Offering = {
  id: number;
  mua_id: string;
  name_offer: string;
  offer_pictures?: string[];
  makeup_type?: string;
  price?: string | number;
};

type MuaLoc = {
  id: string;
  name: string;
  location_lat: string;
  location_lng: string;
  address?: string;
  photo_url?: string;
};

type Row = Offering & {
  mua?: MuaLoc;
  priceNum: number;
  distanceKm?: number | null;
};

/* ================ Consts & helpers ================= */
const API_OFFERINGS = "https://smstudio.my.id/api/offerings";
const API_MUA_LOC = "https://smstudio.my.id/api/mua-location";

const CARD_BG = "#F7F0FF";
const BORDER = "#E9DDF7";
const TEXT_MUTED = "#6B7280";
const PURPLE = "#AA60C8";

const formatIDR = (n: number) => `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

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

function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Location timeout")), ms)),
  ]);
}

async function getUserCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted" || !enabled) return null;

    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };

    const pos = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      10000
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/* ================ Screen ================= */
export default function OfferingsScreen() {
  const router = useRouter(); // <- pindahkan ke dalam komponen

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

  // fetch lokasi user
  useEffect(() => {
    (async () => {
      const loc = await getUserCoords();
      setUserLoc(loc);
    })();
  }, []);

  // fetch awal
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [muaRes, offRes] = await Promise.all([fetch(API_MUA_LOC), fetch(API_OFFERINGS)]);
        const muaJson = await muaRes.json();
        const offJson = await offRes.json();

        const muaList: MuaLoc[] = muaJson?.data ?? muaJson ?? [];
        const mmap: Record<string, MuaLoc> = {};
        for (const m of muaList) mmap[m.id] = m;
        setMuaMap(mmap);

        const pageData: Offering[] = offJson?.data ?? [];
        const mapped = pageData.map((o) => ({
          ...o,
          mua: mmap[o.mua_id],
          priceNum: Number(o.price ?? 0),
        })) as Row[];

        setRows(mapped);
        setNextUrl(offJson?.next_page_url ?? null);
      } catch (e: any) {
        setError(e?.message || "Gagal memuat data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // load more
  async function loadMore() {
    if (!nextUrl || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(nextUrl);
      const json = await res.json();
      const pageData: Offering[] = json?.data ?? [];
      const mapped = pageData.map((o) => ({
        ...o,
        mua: muaMap[o.mua_id],
        priceNum: Number(o.price ?? 0),
      })) as Row[];
      setRows((prev) => [...prev, ...mapped]);
      setNextUrl(json?.next_page_url ?? null);
    } catch {
      // noop
    } finally {
      setLoadingMore(false);
    }
  }

  // jarak
  const rowsWithDistance = useMemo(() => {
    if (!userLoc) return rows.map((r) => ({ ...r, distanceKm: null }));
    return rows.map((r) => {
      const lat = Number(r.mua?.location_lat);
      const lng = Number(r.mua?.location_lng);
      const ok = Number.isFinite(lat) && Number.isFinite(lng);
      const d = ok ? haversineKm(userLoc.lat, userLoc.lng, lat, lng) : null;
      return { ...r, distanceKm: d };
    });
  }, [rows, userLoc]);

  // filter by search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rowsWithDistance;
    return rowsWithDistance.filter((r) => {
      const nm = r.name_offer?.toLowerCase() || "";
      const mua = r.mua?.name?.toLowerCase() || "";
      const tp = r.makeup_type?.toLowerCase() || "";
      return nm.includes(q) || mua.includes(q) || tp.includes(q);
    });
  }, [rowsWithDistance, query]);

  // sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
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

  /* =============== UI =============== */
  function renderItem({ item }: { item: Row }) {
    const title = item.name_offer || "Tanpa Judul";
    const muaName = item.mua?.name || "MUA";
    const typeLabel =
      (item.makeup_type || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "Make Up";
    const price = formatIDR(item.priceNum || 0);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/(user)/offerings/${item.id}`)}
      >
        <View style={styles.card}>
          <View style={styles.cardInner}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.cardSub}>{muaName}</Text>
              <Text style={styles.cardType}>{typeLabel}</Text>
            </View>
            <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
              <Text style={styles.cardPrice}>{price}</Text>
              {typeof item.distanceKm === "number" && (
                <Text style={styles.distance}>
                  {item.distanceKm >= 100
                    ? `${Math.round(item.distanceKm)} km`
                    : `${item.distanceKm.toFixed(1)} km`}
                </Text>
              )}
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
          placeholder="Search"
          placeholderTextColor={TEXT_MUTED}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      <Text style={styles.section}>Temukan Jasa</Text>

      {/* Filter */}
      <View style={[styles.filterWrap, showFilter && { zIndex: 100 }]}>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter(v => !v)}>
          <Text style={{ fontWeight: "700" }}>Filter</Text>
          <Ionicons name="chevron-down" size={16} />
        </TouchableOpacity>

        {showFilter && (
          <View style={styles.filterMenu}>
            <Text style={styles.filterLabel}>Urutkan:</Text>

            <TouchableOpacity
              style={styles.filterRow}
              onPress={() => { setSort("distance"); setShowFilter(false); }}
              accessibilityRole="button"
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
              accessibilityRole="button"
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
              accessibilityRole="button"
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
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : error ? (
        <Text style={{ color: "crimson", marginHorizontal: 20 }}>{error}</Text>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          style={{ zIndex: 0 }}
          ListFooterComponent={
            nextUrl ? (
              <TouchableOpacity style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Text style={{ fontWeight: "700", color: "#111" }}>Muat Lebih Banyak</Text>
                    <Ionicons name="arrow-forward" size={16} />
                  </>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

/* =============== Styles =============== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.select({ ios: 12, android: 8 }) },
  title: { fontSize: 32, fontWeight: "800", marginHorizontal: 20, marginBottom: 12, color: "#111827" },
  searchWrap: {
    height: 44,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, paddingHorizontal: 10, color: "#111" },
  section: { marginHorizontal: 20, marginTop: 18, marginBottom: 6, fontSize: 18, fontWeight: "800" },

  filterWrap: {
    marginHorizontal: 20,
    marginBottom: 10,
    position: "relative",
    zIndex: 1,
  },
  filterBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  filterMenu: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 140,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    zIndex: 9999,
    elevation: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  filterLabel: { fontSize: 12, color: TEXT_MUTED, marginBottom: 4 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  filterText: { fontSize: 14, color: "#111827" },
  filterActiveText: { color: PURPLE, fontWeight: "800" },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 0,
  },
  cardInner: { padding: 16, flexDirection: "row" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  cardSub: { color: TEXT_MUTED, marginTop: 6 },
  cardType: { color: TEXT_MUTED, marginTop: 6 },
  cardPrice: { fontWeight: "800", color: "#111827", fontSize: 16 },
  distance: { marginTop: 6, color: TEXT_MUTED, fontSize: 12 },

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
});
