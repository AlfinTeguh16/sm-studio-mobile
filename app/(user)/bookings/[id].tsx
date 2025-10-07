// app/(user)/bookings/[id].tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";

/* ================== Types ================== */
type Booking = {
  id: number;
  customer_id: string;
  mua_id: string;
  offering_id?: number | null;
  booking_date: string;     // ISO date/time string
  booking_time: string;     // "HH:mm"
  service_type: "home_service" | "studio";
  location_address?: string | null;
  notes?: string | null;

  // invoice + pricing
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  amount?: string | number | null;
  selected_add_ons?: { name: string; price: number }[] | any[];
  subtotal?: string | number | null;
  tax_amount?: string | number | null;
  discount_amount?: string | number | null;
  grand_total?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;

  status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
  payment_method?: string | null;
  payment_status?: "unpaid" | "paid" | "refunded";
  created_at?: string;
  updated_at?: string;
};

type Offering = {
  id: number;
  name_offer: string;
  price?: string | number;
  makeup_type?: string | null;
};

type MuaLoc = {
  id: string;
  name: string;
  address?: string;
};

/* ================== Consts ================== */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_BOOKING = (id: string | number) => `${API_BASE}/bookings/${id}`;
const API_OFFERING = (id: string | number) => `${API_BASE}/offerings/${id}`;
const API_MUA_LOC = `${API_BASE}/mua-location`;

const PURPLE = "#AA60C8";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

/* ================== Helpers ================== */
const formatIDR = (n: number) =>
  `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDate(idt?: string | null) {
  if (!idt) return "-";
  const d = new Date(idt);
  if (!Number.isFinite(+d)) return "-";
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

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

  const res = await fetch(url, {
    method: init.method ?? "GET",
    cache: "no-store",
    ...init,
    headers,
  });

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

/* ================== Screen ================== */
export default function BookingInvoiceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [offering, setOffering] = useState<Offering | null>(null);
  const [mua, setMua] = useState<MuaLoc | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch booking + (opsional) offering + nama MUA
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();

        // booking
        const bJson = await safeFetchJSON<{ data?: Booking } | Booking>(API_BOOKING(id), { headers });
        const bData: Booking = (bJson as any)?.data ?? (bJson as Booking);
        setBooking(bData);

        // offering (untuk tampilkan nama jasa, harga awal)
        if (bData?.offering_id) {
          const oJson = await safeFetchJSON<{ data?: Offering } | Offering>(
            API_OFFERING(bData.offering_id),
            { headers }
          );
          setOffering((oJson as any)?.data ?? (oJson as Offering));
        }

        // nama/alamat MUA
        const mJson = await safeFetchJSON<{ data?: MuaLoc[] } | MuaLoc[]>(API_MUA_LOC, { headers });
        const list: MuaLoc[] = (mJson as any)?.data ?? (mJson as MuaLoc[]) ?? [];
        const found = list.find((m) => m.id === bData.mua_id) || null;
        setMua(found);
      } catch (e: any) {
        if (e?.message === "401_UNAUTH") {
          Alert.alert("Sesi berakhir", "Silakan login kembali.");
          await SecureStore.deleteItemAsync("auth").catch(() => {});
          router.replace("/(auth)/login");
        } else {
          Alert.alert("Oops", e?.message || "Tidak bisa memuat invoice");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  // Hitung total (fallback jika backend tidak kirim beberapa field)
  const computed = useMemo(() => {
    const amount = safeNum(booking?.amount ?? offering?.price, 0);
    const subtotal = safeNum(booking?.subtotal ?? amount, amount);
    const discount = safeNum(booking?.discount_amount, 0);

    let taxAmount = safeNum(booking?.tax_amount, NaN);
    if (!Number.isFinite(taxAmount)) {
      const taxPct = safeNum(booking?.tax, 0);
      taxAmount = (subtotal - discount) * (taxPct / 100);
    }

    const grand = safeNum(booking?.grand_total, subtotal - discount + taxAmount);

    return { amount, subtotal, discount, taxAmount, grand };
  }, [booking, offering]);

  const statusColor = useMemo(() => {
    const s = (booking?.payment_status || "unpaid").toLowerCase();
    if (s === "paid") return "#16A34A";
    if (s === "refunded") return "#0EA5E9";
    return "#F59E0B"; // unpaid/pending
  }, [booking]);

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Text>Invoice tidak ditemukan.</Text>
        <TouchableOpacity
          style={[styles.btn, { marginTop: 10, backgroundColor: PURPLE }]}
          onPress={() => router.replace("/(user)/index")}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Kembali ke Beranda</Text>
        </TouchableOpacity>
      </View>
    


    );
  }

  const title = offering?.name_offer || "Paket/Jasa";
  const inv = booking.invoice_number || `INV-${booking.id}`;
  const waktu = `${fmtDate(booking.booking_date)} • ${booking.booking_time || "-"}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Header mini */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Status + nomor invoice */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={[styles.badge, { backgroundColor: `${statusColor}22`, borderColor: statusColor }]}>
            <Ionicons name="time-outline" size={14} color={statusColor} />
            <Text style={{ color: statusColor, fontWeight: "700", marginLeft: 6 }}>
              {(booking.payment_status || "unpaid").toUpperCase()}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: "#F3F4F6" }]}
            onPress={async () => {
              try {
                await Share.share({
                  message: `Invoice ${inv}\n${title}\nTotal ${formatIDR(computed.grand)}`,
                });
              } catch {}
            }}
          >
            <Ionicons name="share-outline" size={18} color="#111" />
          </TouchableOpacity>
        </View>

        <Text style={styles.invNo}>{inv}</Text>
        <Text style={{ color: MUTED, marginTop: 2 }}>
          Dibuat: {fmtDate(booking.invoice_date || booking.created_at)} • Jatuh tempo: {fmtDate(booking.due_date)}
        </Text>
      </View>

      {/* Rincian pesanan */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Rincian Pesanan</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={{ color: MUTED, marginTop: 4 }}>
          MUA: {mua?.name || booking.mua_id}
        </Text>

        <View style={[styles.divider, { marginVertical: 12 }]} />

        <Row label="Jadwal" value={waktu} />
        <Row
          label="Jenis Layanan"
          value={booking.service_type === "home_service" ? "Home Service" : "Studio"}
        />
        {booking.location_address ? <Row label="Alamat" value={booking.location_address} /> : null}
        {booking.notes ? <Row label="Catatan" value={booking.notes} /> : null}
      </View>

      {/* Ringkasan pembayaran */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ringkasan Pembayaran</Text>

        <Row label="Subtotal" value={formatIDR(computed.subtotal)} />
        <Row label="Diskon" value={`- ${formatIDR(computed.discount)}`} />
        <Row label="Pajak" value={formatIDR(computed.taxAmount)} />
        <View style={[styles.divider, { marginVertical: 10 }]} />
        <Row label="Total" value={formatIDR(computed.grand)} bold />

        {/* CTA */}
        <View style={{ marginTop: 16, gap: 10 }}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: PURPLE }]}
            onPress={async () => {
              await Clipboard.setStringAsync(inv);
              Alert.alert("Disalin", "Nomor invoice telah disalin.");
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Salin No. Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#F3F4F6" }]}
            onPress={() => router.replace("/(user)/index")}
          >
            <Text style={{ color: "#111827", fontWeight: "800" }}>Kembali ke Beranda</Text>
          </TouchableOpacity>
        </View>

        {/* Info pembayaran manual */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={PURPLE} />
          <Text style={styles.infoText}>
            Pembayaran dilakukan secara <Text style={{ fontWeight: "800" }}>manual</Text>. Ikuti petunjuk admin/MUA
            dan kirim bukti transfer. Status akan berubah menjadi <Text style={{ fontWeight: "800" }}>PAID</Text> setelah diverifikasi.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ============ Small row component ============ */
function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.rowLabel]}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: "800" }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/* ================== Styles ================== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.select({ ios: 8, android: 4 }) },

  header: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontWeight: "800", fontSize: 18, color: "#111827" },

  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
  },
  invNo: { fontSize: 22, fontWeight: "800", color: "#111827", marginTop: 8 },

  sectionTitle: { fontWeight: "800", color: "#111827", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },

  divider: { height: 1, backgroundColor: BORDER, opacity: 0.8 },

  rowLabel: { color: MUTED, marginRight: 12 },
  rowValue: { color: "#111827", maxWidth: "60%", textAlign: "right" },

  btn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  infoBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F8F5FF",
    borderWidth: 1,
    borderColor: "#E9DDF7",
    marginTop: 12,
  },
  infoText: { color: "#4B5563", flex: 1, lineHeight: 18 },
});
