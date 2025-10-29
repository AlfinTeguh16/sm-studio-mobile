// app/(mua)/(tabs)/index.tsx
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
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Rect } from "react-native-svg";
import { ensureLocationPermission } from "../../../src/permissions";
import { getAuthToken } from "../../../utils/authStorage";
import { api } from "../../../lib/api";

/* ========== Types ========== */
type MeResp = {
  id?: string;
  name?: string;
  profile?: { id?: string; name?: string; role?: string };
  data?: any;
};

type Booking = {
  id: number;
  customer_id: string;
  mua_id: string;
  offering_id?: number | null;
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // "HH:MM"
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
  updated_at?: string | null;
};

type Portfolio = {
  id: number;
  name: string;
  photos?: string[] | null;
  makeup_type?: string | null;
};

type SparkDatum = number;

/* ========== Consts ========== */
const BASE_URL = "https://smstudio.my.id";
const API_URL = `${BASE_URL}/api`;
const API_BOOKINGS = `${API_URL}/bookings`;
const API_PORTFOLIOS = `${API_URL}/portfolios`;

const PURPLE = "#AA60C8";
const PURPLE_2 = "#C084FC";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";

/* ========== Helpers ========== */
const fmtDateTimeShort = (isoDate: string, hhmm: string) => {
  const d = new Date(`${isoDate}T${hhmm}:00`);
  return `${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} - ${d.toLocaleDateString(
    "id-ID",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  )}`;
};

const toJSDate = (b: Booking) => new Date(`${b.booking_date}T${b.booking_time}:00`);

const monthFromUpdatedOrBooking = (b: Booking): number | null => {
  if (b.updated_at) {
    const d = new Date(b.updated_at);
    if (Number.isFinite(+d)) return d.getMonth();
  }
  const d2 = toJSDate(b);
  return Number.isFinite(+d2) ? d2.getMonth() : null;
};

const normPhoto = (u?: string | null) => {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${BASE_URL}${u}`;
  return u;
};

/* ========== Sparkline ========== */
function Sparkline({ data, width = 320, height = 120 }: { data: SparkDatum[]; width?: number; height?: number }) {
  if (!data || data.length === 0) return <View style={{ width, height, backgroundColor: "#fff" }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const scaleX = (i: number) => (i / (data.length - 1)) * w + pad;
  const scaleY = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * h;

  let d = `M ${scaleX(0)} ${scaleY(data[0])}`;
  data.forEach((v, i) => {
    if (i === 0) return;
    d += ` L ${scaleX(i)} ${scaleY(v)}`;
  });

  const area = `${d} L ${scaleX(data.length - 1)} ${pad + h} L ${scaleX(0)} ${pad + h} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={PURPLE_2} stopOpacity={0.25} />
          <Stop offset="1" stopColor={PURPLE_2} stopOpacity={0.02} />
        </SvgGrad>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />
      <Path d={area} fill="url(#grad)" />
      <Path d={d} stroke={PURPLE} strokeWidth={2} fill="none" />
    </Svg>
  );
}

/* ========== Screen ========== */
export default function MuaDashboard() {
  const router = useRouter();

  // beri generics eksplisit — mencegah never[]
  const [me, setMe] = useState<{ id?: string; name?: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState<boolean>(true);

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState<boolean>(true);

  // ambil token & me (safe)
  useEffect(() => {
    (async () => {
      try {
        const t = await getAuthToken();
        if (t) setToken(t);

        // coba helper api.me() jika tersedia
        let resp: any = null;
        try {
          resp = await api.me();
        } catch {
          // fallback to raw fetch
          try {
            const res = await fetch(`${API_URL}/auth/me`, {
              headers: { Accept: "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
            });
            resp = await res.json().catch(() => null);
          } catch {
            resp = null;
          }
        }

        if (resp) {
          const body = resp?.data ?? resp;
          const id = body?.profile?.id ?? body?.id ?? (body?.user && body.user.id) ?? undefined;
          const name = body?.profile?.name ?? body?.name ?? (body?.user && body.user.name) ?? undefined;
          setMe({ id, name });
        } else {
          setMe(null);
        }
      } catch (err) {
        console.warn("error loading me:", err);
        setMe(null);
      }
    })();
  }, []);

  /* ========== bookings fetch (completed for metrics) ========== */
  useEffect(() => {
    if (!me?.id) return;

    let alive = true;
    (async () => {
      setLoadingBookings(true);
      try {
        const perPage = 100;
        let page = 1;
        let all: Booking[] = [];
        let nextUrl: string | null =
          `${API_BOOKINGS}?mua_id=${encodeURIComponent(String(me.id))}` +
          `&status=completed&per_page=${perPage}&page=${page}`;

        while (nextUrl && alive) {
          const response = await fetch(nextUrl, {
            headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          const json: any = await response.json().catch(() => ({}));
          const pageData: Booking[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
          all = all.concat(pageData);

          if (json?.next_page_url) {
            nextUrl = json.next_page_url as string | null;
          } else if (pageData.length === perPage) {
            page += 1;
            nextUrl =
              `${API_BOOKINGS}?mua_id=${encodeURIComponent(String(me.id))}` +
              `&status=completed&per_page=${perPage}&page=${page}`;
          } else {
            nextUrl = null;
          }

          if (page > 20) {
            nextUrl = null; // guard
          }
        }

        if (alive) setBookings(all);
      } catch (err) {
        console.warn("fetch bookings error:", err);
        if (alive) setBookings([]);
      } finally {
        if (alive) setLoadingBookings(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [me?.id, token]);

  /* ========== portfolios fetch ========== */
  useEffect(() => {
    if (!me?.id) return;

    let alive = true;
    (async () => {
      setLoadingPortfolios(true);
      try {
        const url = `${API_PORTFOLIOS}?muaId=${encodeURIComponent(String(me.id))}&per_page=20&sort=created_at&dir=desc`;
        const res = await fetch(url, {
          headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const j = await res.json().catch(() => ({}));
        const rows: Portfolio[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        if (alive) setPortfolios(rows);
      } catch (err) {
        console.warn("fetch portfolios error:", err);
        if (alive) setPortfolios([]);
      } finally {
        if (alive) setLoadingPortfolios(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [me?.id, token]);

  /* upcoming: cari booking pending/confirmed di masa depan dari 'bookings' */
  const upcoming = useMemo<Booking | null>(() => {
    const now = new Date();
    // bookings mungkin kosong; filter aman
    const cand = bookings
      .filter((b: Booking) => (b.status === "pending" || b.status === "confirmed") && toJSDate(b) >= now)
      .sort((a: Booking, b: Booking) => +toJSDate(a) - +toJSDate(b));
    return cand.length ? cand[0] : null;
  }, [bookings]);

  const totalDoneAllTime = useMemo(() => bookings.filter((b) => b.status === "completed").length, [bookings]);

  const completedByMonth = useMemo(() => {
    const byMonth = new Array<number>(12).fill(0);
    bookings.forEach((b) => {
      if (b.status !== "completed") return;
      const m = monthFromUpdatedOrBooking(b);
      if (m != null) byMonth[m] += 1;
    });
    return byMonth;
  }, [bookings]);

  const totalDoneThisMonth = useMemo(() => {
    const m = new Date().getMonth();
    return completedByMonth[m] || 0;
  }, [completedByMonth]);

  const totalDone = useMemo(
    () => bookings.filter((b) => b.status === "completed" && b.mua_id === me?.id).length,
    [bookings, me?.id]
  );

  const chartData = useMemo(() => {
    const byMonth = new Array<number>(12).fill(0);
    bookings.forEach((b) => {
      if (b.status !== "completed" || b.mua_id !== me?.id) return;
      const m = monthFromUpdatedOrBooking(b);
      if (m != null) byMonth[m] += 1;
    });
    return byMonth;
  }, [bookings, me?.id]);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  async function onGetLocation() {
    try {
      const pos = await ensureLocationPermission();
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e: any) {
      Alert.alert("Izin Dibutuhkan", e?.message || "Gagal mengambil lokasi.");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Hello, {me?.name ?? "MUA"}</Text>
          <Text style={styles.subtitle}>Let's make a great things today!</Text>
        </View>
        <TouchableOpacity style={styles.bell} onPress={() => router.push("notifications")}>
          <Ionicons name="notifications-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <LinearGradient colors={[PURPLE, PURPLE_2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.nextTitle}>Jadwal Mendatang</Text>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: "rgba(255,255,255,0.25)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="calendar-outline" size={16} color="#fff" />
          </View>
        </View>

        <Text style={styles.nextName} numberOfLines={1}>
          {upcoming ? `#${upcoming.id}` : "Tidak ada"}
        </Text>

        <View style={styles.nextFooter}>
          <TouchableOpacity
            disabled={!upcoming}
            style={[styles.nextBtn, !upcoming && { opacity: 0.6 }]}
            onPress={() => upcoming && router.push({ pathname: "/(mua)/bookings/[id]", params: { id: String(upcoming.id) } })}
          >
            <Text style={{ fontWeight: "700", color: PURPLE }}>Cek Detail</Text>
          </TouchableOpacity>
          <Text style={styles.nextTime}>{upcoming ? fmtDateTimeShort(upcoming.booking_date, upcoming.booking_time) : "—"}</Text>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <Text style={styles.blockTitle}>Pekerjaan Selesai per Bulan</Text>
        <View style={styles.chartCard}>
          <Sparkline data={chartData} width={320} height={120} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: MUTED, fontSize: 12 }}>Jan–Des (tahun berjalan)</Text>
            <Text style={{ color: MUTED, fontSize: 12 }}>
              Bulan ini: <Text style={{ color: "#111827", fontWeight: "800" }}>{totalDoneThisMonth}</Text>
            </Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>Total Pekerjaan Selesai</Text>
          <Text style={styles.kpiValue}>{totalDoneAllTime}</Text>
          <Text style={{ color: MUTED, marginTop: 4 }}>
            Bulan ini: <Text style={{ color: "#111827", fontWeight: "800" }}>{totalDoneThisMonth}</Text>
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <Text style={styles.blockTitle}>Portofolio</Text>

        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/(mua)/portfolio/new")} activeOpacity={0.9}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>Tambah Portofolio</Text>
        </TouchableOpacity>

        {loadingPortfolios ? (
          <ActivityIndicator style={{ marginTop: 10 }} />
        ) : portfolios.length === 0 ? (
          <Text style={{ color: MUTED, marginTop: 8 }}>Belum ada portofolio.</Text>
        ) : (
          portfolios.map((p: Portfolio) => {
            const first = Array.isArray(p.photos) ? p.photos[0] : null;
            const cover = normPhoto(first) || "https://via.placeholder.com/600x400.png?text=Portfolio";
            return (
              <View key={String(p.id)} style={styles.portCard}>
                <Image source={{ uri: cover }} style={styles.portPhoto} />
                <View style={{ flex: 1, padding: 12 }}>
                  <Text style={styles.portTitle} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {!!p.makeup_type && (
                    <>
                      <Text style={styles.metaLabel}>Tipe Make Up</Text>
                      <Text style={styles.metaValue}>{p.makeup_type}</Text>
                    </>
                  )}
                  <TouchableOpacity style={styles.portBtn} onPress={() => router.push({ pathname: "/(mua)/portfolio/[id]", params: { id: String(p.id) } })}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Detail</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

/* ========== Styles ========== */
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

  subtitle: { color: MUTED, marginTop: 4 },

  nextCard: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 16,
    padding: 16,
  },
  nextTitle: { color: "#fff", fontWeight: "700" },
  nextName: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 12 },
  nextFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  nextBtn: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  nextTime: { color: "#fff", opacity: 0.95 },

  blockTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 8 },

  chartCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 8,
  },

  kpiCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#E9DDF7",
    borderRadius: 12,
    padding: 16,
  },
  kpiTitle: { color: "#111827" },
  kpiValue: { marginTop: 6, fontSize: 28, fontWeight: "800", color: "#111827" },

  addBtn: {
    alignSelf: "flex-start",
    backgroundColor: PURPLE,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  portCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    flexDirection: "row",
  },
  portPhoto: { width: 140, height: "100%", backgroundColor: "#eee" },
  portTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  metaLabel: { color: MUTED, marginTop: 6 },
  metaValue: { color: "#111827" },
  portBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: PURPLE,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
});
