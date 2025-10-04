// app/(mua)/index.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import Svg, { G, Line as SvgLine, Path, Circle, Text as SvgText } from "react-native-svg";

/* ================== Types ================== */
type Booking = any; // struktur bisa bervariasi; kita map fleksibel
type PortfolioItem = {
  id: string;
  title: string;
  type?: string;
  photo?: string;
};

/* ================== Consts ================== */
const API_BASE = "https://smstudio.my.id/api";
const API_BOOKINGS = `${API_BASE}/bookings?role=mua`;
const API_ME = `${API_BASE}/auth/me`;
const API_PORTFOLIO_MINE = `${API_BASE}/portfolios/mine`;

const PURPLE = "#AA60C8";
const GRAY = "#6B7280";

/* ================== Utils ================== */
function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}
function customerName(b: any): string {
  return (
    pick(b, ["customer_name", "client_name"]) ||
    pick(b?.customer, ["name"]) ||
    pick(b?.client, ["name"]) ||
    pick(b?.user, ["name"]) ||
    "Customer"
  );
}
function parseBookingDate(b: any): Date | null {
  const d = pick<string>(b, ["date", "booking_date", "scheduled_for", "start_at", "start_time", "datetime"]);
  const t = pick<string>(b, ["time", "booking_time", "start_time"]);
  let iso: string | undefined;
  if (d && t) iso = `${d} ${t}`;
  else if (d) iso = d;
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(+dt)) {
    const ts = Number(iso);
    if (Number.isFinite(ts)) return new Date(ts);
    return null;
  }
  return dt;
}
function isFinished(status?: string) {
  const s = (status || "").toLowerCase();
  return ["done", "completed", "finished", "success", "selesai"].some((k) => s.includes(k));
}
function formatTimeHuman(dt: Date) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${pad(dt.getHours())}.${pad(dt.getMinutes())}`;
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) return `Hari Ini - ${hhmm}`;
  return `${dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} - ${hhmm}`;
}
function monthIndex(dt: Date) {
  return dt.getMonth();
}

/* ================== Mini Line Chart (SVG) ================== */
function SimpleLineChart({
  data, // {x: label, y: number}[]
  height = 180,
  padding = { top: 16, bottom: 32, left: 38, right: 16 },
}: {
  data: { x: string; y: number }[];
  height?: number;
  padding?: { top: number; bottom: number; left: number; right: number };
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const maxY = Math.max(1, ...data.map((d) => d.y));
  const innerW = Math.max(1, width - padding.left - padding.right);
  const innerH = Math.max(1, height - padding.top - padding.bottom);

  const points = useMemo(() => {
    if (innerW <= 1) return [] as { x: number; y: number }[];
    const n = data.length;
    if (n === 0) return [];
    if (n === 1) {
      return [{ x: padding.left + innerW / 2, y: padding.top + innerH / 2 }];
    }
    return data.map((d, i) => {
      const px = padding.left + (i / (n - 1)) * innerW;
      const ratio = d.y / maxY;
      const py = padding.top + (1 - ratio) * innerH;
      return { x: px, y: py };
    });
  }, [data, innerW, innerH, padding.left, padding.top, maxY]);

  const pathD = useMemo(() => {
    if (!points.length) return "";
    return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  }, [points]);

  // grid (4 garis)
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((r) => padding.top + r * innerH);

  // label bawah: tampilkan tiap 2 bulan agar tidak terlalu rapat
  const showLabel = (i: number) => i % 2 === 0 || data.length <= 6;

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <G>
            {/* grid horizontal */}
            {gridYs.map((y, idx) => (
              <SvgLine key={idx} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#E5E7EB" strokeWidth={1} />
            ))}

            {/* sumbu Y label kecil (0 & max) */}
            <SvgText x={padding.left - 6} y={padding.top + innerH} fontSize={9} fill="#6B7280" textAnchor="end">
              0
            </SvgText>
            <SvgText x={padding.left - 6} y={padding.top + 8} fontSize={9} fill="#6B7280" textAnchor="end">
              {maxY}
            </SvgText>

            {/* jalur garis */}
            <Path d={pathD} stroke={PURPLE} strokeWidth={2} fill="none" />

            {/* titik */}
            {points.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={3} fill={PURPLE} />
            ))}

            {/* label bawah */}
            {points.map((p, i) =>
              showLabel(i) ? (
                <SvgText key={`lb-${i}`} x={p.x} y={height - 10} fontSize={9} fill="#6B7280" textAnchor="middle">
                  {data[i].x}
                </SvgText>
              ) : null
            )}
          </G>
        </Svg>
      )}
    </View>
  );
}

/* ================== Screen ================== */
export default function MuaDashboard() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  // Ambil nama & token dari SecureStore → /auth/me
  useEffect(() => {
    (async () => {
      try {
        const authStr = await SecureStore.getItemAsync("auth");
        if (authStr) {
          const auth = JSON.parse(authStr);
          if (auth?.token) setToken(auth.token);
          const nm = auth?.user?.name || auth?.profile?.name;
          if (nm) setDisplayName(String(nm));
        }
      } catch {}
      try {
        const res = await fetch(API_ME, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const me = await res.json();
          const nm = me?.name || me?.profile?.name;
          if (nm) setDisplayName(String(nm));
        }
      } catch {}
    })();
  }, [token]);

  // Ambil bookings (role=mua)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_BOOKINGS, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await res.json();
        const rows = (json?.data ?? json ?? []) as Booking[];
        setBookings(Array.isArray(rows) ? rows : []);
      } catch (e) {
        console.warn("bookings fetch error:", e);
        setBookings([]);
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, [token]);

  // Ambil portfolio saya
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_PORTFOLIO_MINE, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await res.json();
        const items: PortfolioItem[] = (json?.data ?? json ?? []).map((x: any) => ({
          id: String(x.id ?? x.uuid ?? Math.random()),
          title: x.title ?? x.name ?? "Tanpa Judul",
          type: x.type ?? x.category ?? "Natural",
          photo:
            (Array.isArray(x.photos) && x.photos[0]) ||
            (Array.isArray(x.pictures) && x.pictures[0]) ||
            x.photo_url ||
            "https://via.placeholder.com/600x400.png?text=Portfolio",
        }));
        setPortfolio(items);
      } catch (e) {
        console.warn("portfolio fetch error:", e);
        setPortfolio([]);
      } finally {
        setLoadingPortfolio(false);
      }
    })();
  }, [token]);

  // Next upcoming booking
  const nextBooking = useMemo(() => {
    const future = bookings
      .map((b) => ({ raw: b, at: parseBookingDate(b), status: (b?.status || "").toLowerCase() }))
      .filter((x) => x.at && x.at.getTime() >= Date.now() && !["cancel", "canceled", "cancelled"].includes(x.status))
      .sort((a, b) => +a.at! - +b.at!);
    return future[0] || null;
  }, [bookings]);

  // Grafik: jumlah booking selesai per bulan (tahun berjalan)
  const chartData = useMemo(() => {
    const arr = new Array(12).fill(0) as number[];
    const nowYear = new Date().getFullYear();
    for (const b of bookings) {
      const dt = parseBookingDate(b);
      const status = (b?.status || "").toLowerCase();
      if (!dt || dt.getFullYear() !== nowYear) continue;
      if (isFinished(status)) {
        arr[monthIndex(dt)] += 1;
      }
    }
    const labels = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGS", "SEP", "OKT", "NOV", "DES"];
    return arr.map((y, i) => ({ x: labels[i], y }));
  }, [bookings]);

  const totalFinished = useMemo(
    () => bookings.filter((b) => isFinished((b?.status || "").toLowerCase())).length,
    [bookings]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>
            Hello, <Text style={{ fontWeight: "800" }}>{displayName || "MUA"}</Text>
          </Text>
          <Text style={styles.tagline}>Let&apos;s make a great things today!</Text>
        </View>
        <TouchableOpacity style={styles.bell} onPress={() => { /* router.push("/(mua)/notifications") */ }}>
          <Ionicons name="notifications-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Jadwal Mendatang */}
      <LinearGradient colors={["#C791E5", "#9D61C5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.upcomingCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={styles.upcomingLabel}>Jadwal Mendatang</Text>
          <View style={styles.upcomingIcon}>
            <Ionicons name="document-text-outline" size={16} color="#fff" />
          </View>
        </View>

        {loadingBookings ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
        ) : nextBooking?.at ? (
          <>
            <Text style={styles.upcomingName} numberOfLines={1}>
              {customerName(nextBooking.raw)}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
              <TouchableOpacity style={styles.detailBtn} onPress={() => { /* router.push("/(mua)/bookings") */ }}>
                <Text style={{ color: "#9D61C5", fontWeight: "800" }}>Cek Detail</Text>
              </TouchableOpacity>
              <Text style={styles.upcomingTime}>{formatTimeHuman(nextBooking.at)}</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.upcomingName, { fontSize: 16 }]}>Belum ada jadwal</Text>
        )}
      </LinearGradient>

      {/* Grafik pekerjaan */}
      <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
        <Text style={styles.sectionTitle}>Grafik Pekerjaan Anda</Text>
        <View style={styles.chartCard}>
          {loadingBookings ? (
            <ActivityIndicator style={{ marginVertical: 16 }} />
          ) : chartData.every((p) => p.y === 0) ? (
            <Text style={{ color: GRAY, textAlign: "center", paddingVertical: 18 }}>
              Belum ada data selesai tahun ini.
            </Text>
          ) : (
            <SimpleLineChart data={chartData} />
          )}
        </View>

        {/* Total selesai */}
        <View style={styles.totalCard}>
          <Text style={{ color: GRAY }}>Total Pekerjaan Selesai</Text>
          <Text style={{ fontSize: 28, fontWeight: "800" }}>{totalFinished}</Text>
        </View>
      </View>

      {/* Portfolio */}
      <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
        <Text style={styles.sectionTitle}>Portofolio</Text>

        <TouchableOpacity style={styles.addPortfolioBtn} onPress={() => { /* router.push("/(mua)/portfolio/new") */ }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Tambah Portofolio</Text>
        </TouchableOpacity>

        {loadingPortfolio ? (
          <ActivityIndicator style={{ marginTop: 10 }} />
        ) : portfolio.length === 0 ? (
          <Text style={{ color: GRAY, marginTop: 8 }}>Belum ada portofolio.</Text>
        ) : (
          portfolio.map((p) => (
            <View key={p.id} style={styles.portItem}>
              <View style={{ flex: 1, padding: 12 }}>
                <Text style={styles.portTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                <Text style={styles.portMeta}>Tipe Make Up</Text>
                <Text style={styles.portType}>{p.type || "Natural"}</Text>

                <TouchableOpacity style={styles.detailChip} onPress={() => { /* router.push(`/(mua)/portfolio/${p.id}`) */ }}>
                  <Text style={{ color: "#9D61C5", fontWeight: "700" }}>Detail</Text>
                </TouchableOpacity>
              </View>
              <Image source={{ uri: p.photo }} style={styles.portImage} />
            </View>
          ))
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
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { fontSize: 26, fontWeight: "600", color: "#111827" },
  tagline: { color: GRAY, marginTop: 4 },
  bell: { width: 34, height: 34, borderRadius: 17, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" },

  upcomingCard: {
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 14,
    padding: 16,
  },
  upcomingLabel: { color: "#fff", opacity: 0.95 },
  upcomingIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.28)", alignItems: "center", justifyContent: "center" },
  upcomingName: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 6 },
  detailBtn: { backgroundColor: "#fff", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginRight: 10 },
  upcomingTime: { color: "#fff", opacity: 0.9 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 8 },

  chartCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },

  totalCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },

  addPortfolioBtn: {
    alignSelf: "flex-start",
    backgroundColor: PURPLE,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 10,
  },

  portItem: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#FBF7FF",
  },
  portTitle: { fontWeight: "800", color: "#111827" },
  portMeta: { color: GRAY, marginTop: 4 },
  portType: { color: GRAY, marginTop: 2 },
  detailChip: {
    alignSelf: "flex-start",
    backgroundColor: "#EEE3FA",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  portImage: { width: 140, height: 110, backgroundColor: "#eee" },
});
