// app/(mua)/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Rect } from "react-native-svg";

/* ================== Types ================== */
type Me = {
  id?: string;                // profile id (UUID)
  name?: string;
  profile?: { id?: string; name?: string; role?: string };
};

type Booking = {
  id: number;
  customer_id: string;
  mua_id: string;
  offering_id?: number | null;
  booking_date: string; // ISO
  booking_time: string; // "HH:MM"
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
};

type Portfolio = {
  id: number;
  name: string;
  photos?: string[] | null;
  makeup_type?: string | null;
};

type SparkDatum = number;

/* ================== Const ================== */
const API = "https://smstudio.my.id/api";
const API_ME = `${API}/auth/me`;
const API_BOOKINGS = `${API}/bookings`;
const API_PORTFOLIOS = `${API}/portfolios`;

const PURPLE = "#AA60C8";
const PURPLE_2 = "#C084FC";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";

/* ================== Utils ================== */
const fmtDateTimeShort = (isoDate: string, hhmm: string) => {
  const d = new Date(`${isoDate}T${hhmm}:00`);
  return `${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} - ${d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}`;
};

const toJSDate = (b: Booking) => new Date(`${b.booking_date}T${b.booking_time}:00`);

/* ================== Tiny Sparkline ================== */
function Sparkline({
  data,
  width = 280,
  height = 120,
}: {
  data: SparkDatum[];
  width?: number;
  height?: number;
}) {
  if (!data.length) return <View style={{ width, height, backgroundColor: "#fff" }} />;
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

/* ================== Screen ================== */
export default function MuaDashboard() {
  const router = useRouter();

  const [me, setMe] = useState<{ id?: string; name?: string }>({});
  const [token, setToken] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  // ambil token & me
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
          const id = auth?.profile?.id || auth?.user?.id;
          const name = auth?.profile?.name || auth?.user?.name;
          if (id) setMe({ id, name });
        }
      } catch {}
      // fallback /auth/me bila id belum ada
      try {
        const res = await fetch(API_ME, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const m: Me = await res.json();
          const id = m.profile?.id || m.id;
          const name = m.profile?.name || m.name;
          setMe((s) => ({ id: s.id ?? id, name: s.name ?? name }));
        }
      } catch {}
    })();
  }, [token]);

  // fetch bookings
  useEffect(() => {
    if (!me.id) return;
    (async () => {
      setLoadingBookings(true);
      try {
        const res = await fetch(API_BOOKINGS);
        const j = await res.json();
        const rows: Booking[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        setBookings(rows.filter((b) => b.mua_id === me.id));
      } catch {
        setBookings([]);
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, [me.id]);

  // fetch portfolios
  useEffect(() => {
    if (!me.id) return;
    (async () => {
      setLoadingPortfolios(true);
      try {
        const res = await fetch(`${API_PORTFOLIOS}?mua_id=${me.id}`);
        const j = await res.json();
        const rows: Portfolio[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        setPortfolios(rows);
      } catch {
        setPortfolios([]);
      } finally {
        setLoadingPortfolios(false);
      }
    })();
  }, [me.id]);

  // jadwal mendatang terdekat (pending|confirmed di masa depan)
  const upcoming = useMemo(() => {
    const now = new Date();
    return bookings
      .filter((b) => (b.status === "pending" || b.status === "confirmed") && toJSDate(b) >= now)
      .sort((a, b) => +toJSDate(a) - +toJSDate(b))[0];
  }, [bookings]);

  // total pekerjaan selesai
  const totalDone = useMemo(() => bookings.filter((b) => b.status === "completed").length, [bookings]);

  // dummy grafik: hitung jumlah job per bulan dari bookings
  const chartData = useMemo(() => {
    const byMonth = new Array(12).fill(0);
    bookings.forEach((b) => {
      const d = toJSDate(b);
      byMonth[d.getMonth()] += 1;
    });
    // buat lebih enak dilihat
    return byMonth.slice(0, 12).map((n) => n || 0);
  }, [bookings]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hello, {me.name || "MUA"}</Text>
          <Text style={styles.subtitle}>Let's make a great things today!</Text>
        </View>
        <TouchableOpacity style={styles.bell} onPress={() => router.push("/(mua)/notifications")}>
          <Ionicons name="notifications-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Jadwal Mendatang */}
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
            onPress={() =>
              upcoming && router.push({ pathname: "/(mua)/bookings/[id]", params: { id: String(upcoming.id) } })
            }
          >
            <Text style={{ fontWeight: "700", color: PURPLE }}>Cek Detail</Text>
          </TouchableOpacity>
          <Text style={styles.nextTime}>
            {upcoming ? fmtDateTimeShort(upcoming.booking_date, upcoming.booking_time) : "—"}
          </Text>
        </View>
      </LinearGradient>

      {/* Grafik pekerjaan */}
      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <Text style={styles.blockTitle}>Grafik Pekerjaan Anda</Text>
        <View style={styles.chartCard}>
          <Sparkline data={chartData} width={320} height={120} />
        </View>
      </View>

      {/* KPI */}
      <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>Total Pekerjaan Selesai</Text>
          <Text style={styles.kpiValue}>{totalDone}</Text>
        </View>
      </View>

      {/* Portofolio */}
      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <Text style={styles.blockTitle}>Portofolio</Text>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/(mua)/portfolio/new")}
          activeOpacity={0.9}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Tambah Portofolio</Text>
        </TouchableOpacity>

        {loadingPortfolios ? (
          <ActivityIndicator style={{ marginTop: 10 }} />
        ) : portfolios.length === 0 ? (
          <Text style={{ color: MUTED, marginTop: 8 }}>Belum ada portofolio.</Text>
        ) : (
          portfolios.map((p) => {
            const cover =
              (Array.isArray(p.photos) && p.photos[0]) || "https://via.placeholder.com/600x400.png?text=Portfolio";
            return (
              <View key={p.id} style={styles.portCard}>
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
                  <TouchableOpacity
                    style={styles.portBtn}
                    onPress={() => router.push({ pathname: "/(mua)/portfolio/[id]", params: { id: String(p.id) } })}
                  >
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

/* ================== Styles ================== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { fontSize: 26, fontWeight: "800", color: "#111827" },
  subtitle: { color: MUTED, marginTop: 4 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },

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
  portPhoto: { width: 140, height: 120, backgroundColor: "#eee" },
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
