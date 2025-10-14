// app/(user)/bookings/[id].tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Share,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";

/* ============== Debug & Console Helpers ============== */
const DEBUG_ALERT = true; // set ke false saat production
const LOG_NS = "[BookingInvoice]";

function debugAlert(title: string, payload?: any) {
  if (!DEBUG_ALERT) return;
  let msg = "";
  try {
    if (payload == null) msg = "";
    else if (typeof payload === "string") msg = payload;
    else msg = JSON.stringify(payload, null, 2);
  } catch {
    msg = String(payload);
  }
  if (msg.length > 1200) msg = msg.slice(0, 1200) + "…(truncated)";
  Alert.alert(`[DEBUG] ${title}`, msg || "(no details)");
}
function log(...args: any[]) { console.log(LOG_NS, ...args); }          // eslint-disable-line no-console
function warn(...args: any[]) { console.warn(LOG_NS, ...args); }         // eslint-disable-line no-console
function error(...args: any[]) { console.error(LOG_NS, ...args); }       // eslint-disable-line no-console

/* ===================== Types ===================== */
type Booking = {
  id: number | string;
  customer_id: string;
  mua_id: string;
  offering_id?: number | string | null;
  booking_date: string;
  booking_time: string;
  service_type: "home_service" | "studio";
  location_address?: string | null;
  notes?: string | null;

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
  id: number | string;
  name_offer: string;
  price?: string | number;
  makeup_type?: string | null;
};

type MuaLoc = {
  id: string;
  name: string;
  address?: string;
  phone?: string | null;
};

/* ===================== Consts ===================== */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_BOOKING = (id: string | number) => `${API_BASE}/bookings/${id}`;
const API_OFFERING = (id: string | number) => `${API_BASE}/offerings/${id}`;
const API_MUA_LOC = `${API_BASE}/mua-location`;

const PURPLE = "#AA60C8";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

/* ===================== Utils ===================== */
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
    if (res.status === 401) {
      await SecureStore.deleteItemAsync("auth").catch(() => {});
      throw new Error("401_UNAUTH");
    }
    throw new Error(`HTTP ${res.status} (ct=${ct}) — ${text.slice(0, 160)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected non-JSON (ct=${ct}) — ${text.slice(0, 160)}`);
  }
}

/** Normalisasi nomor telepon ke +62xxxxxxxx */
function normalizePhoneToID(pho?: string | null): string | null {
  if (!pho) return null;
  let s = String(pho).trim();
  if (!s) return null;
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) return s;
  if (s.startsWith("0")) return "+62" + s.slice(1);
  if (s.startsWith("62")) return "+" + s;
  return s.startsWith("+") ? s : `+${s}`;
}

/* ===================== Screen ===================== */
export default function BookingInvoiceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [offering, setOffering] = useState<Offering | null>(null);
  const [mua, setMua] = useState<MuaLoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const group = `${LOG_NS} fetch:${id}`;
      console.groupCollapsed(group);
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        log("headers ready", Object.keys(headers));

        // Booking
        const bJson = await safeFetchJSON<{ data?: Booking } | Booking>(API_BOOKING(id), { headers });
        const bData: Booking = (bJson as any)?.data ?? (bJson as Booking);
        setBooking(bData);
        log("booking loaded", { id: bData?.id, mua_id: bData?.mua_id, offering_id: bData?.offering_id });

        // Offering (optional)
        if (bData?.offering_id) {
          try {
            const oJson = await safeFetchJSON<{ data?: Offering } | Offering>(
              API_OFFERING(bData.offering_id),
              { headers }
            );
            const oData = (oJson as any)?.data ?? (oJson as Offering);
            setOffering(oData);
            log("offering loaded", { id: oData?.id, name_offer: oData?.name_offer });
          } catch (e: any) {
            warn("offering fetch failed", e?.message || e);
            setOffering(null);
          }
        } else {
          log("no offering_id, skipping offering fetch");
        }

        // MUA list (ambil nama & phone)
        try {
          const mJson = await safeFetchJSON<{ data?: MuaLoc[] } | MuaLoc[]>(API_MUA_LOC, { headers });
          const list: MuaLoc[] = (mJson as any)?.data ?? (mJson as MuaLoc[]) ?? [];
          const found = list.find((m) => m.id === bData.mua_id) || null;
          setMua(found);
          log("mua loaded", found ? { id: found.id, name: found.name, phone: found.phone } : "not found");
        } catch (e: any) {
          warn("mua fetch failed", e?.message || e);
          setMua(null);
        }
      } catch (e: any) {
        error("fetch error", e?.message || e);
        if (e?.message === "401_UNAUTH") {
          debugAlert("Auth expired / 401", { id, error: e?.message });
          router.replace("/(auth)/login");
        } else {
          debugAlert("Load invoice gagal", { id, error: e?.message });
          router.replace("/(user)/(tabs)/booking");
        }
      } finally {
        setLoading(false);
        console.groupEnd();
      }
    })();
  }, [id, router]);

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
    return "#F59E0B";
  }, [booking]);

  // WhatsApp CTA — sukses: buka WA, tanpa alert sukses
  const onPressPesan = async () => {
    const group = `${LOG_NS} wa:${booking?.id}`;
    console.groupCollapsed(group);
    try {
      if (!mua) {
        warn("MUA belum siap", { bookingId: booking?.id });
        debugAlert("MUA belum siap", { bookingId: booking?.id });
        return;
      }
      const intl = normalizePhoneToID(mua.phone || undefined);
      if (!intl) {
        warn("Nomor WA kosong/invalid", { phone: mua?.phone });
        debugAlert("Nomor WA MUA kosong/invalid", { phone: mua?.phone });
        return;
      }

      const title = offering?.name_offer || "Paket/Jasa";
      const inv = booking?.invoice_number || `INV-${booking?.id}`;
      const whenText = booking
        ? `${fmtDate(booking.booking_date)} • ${booking.booking_time || "-"}`
        : "-";

      const text = encodeURIComponent(
        `Halo ${mua.name}, saya ingin konfirmasi pemesanan.\n` +
          `• Invoice: ${inv}\n` +
          `• Layanan: ${title}\n` +
          `• Jadwal: ${whenText}\n` +
          `• Total: ${formatIDR(computed.grand)}\n\n` +
          `Mohon info ketersediaannya. Terima kasih.`
      );

      const waUrl = `https://wa.me/${intl.replace("+", "")}?text=${text}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      log("wa intent", { waUrl, canOpen });
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        warn("Tidak bisa open WhatsApp", { waUrl });
        debugAlert("Tidak bisa membuka WhatsApp", { waUrl });
      }
    } catch (err: any) {
      error("WA open error", err?.message || err);
      debugAlert("Error saat open WhatsApp", err?.message || err);
    } finally {
      console.groupEnd();
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!booking) {
    debugAlert("Booking null setelah load", { id });
    router.replace("/(user)/(tabs)/booking");
    return null;
  }

  const title = offering?.name_offer || "Paket/Jasa";
  const inv = booking.invoice_number || `INV-${booking.id}`;
  const waktu = `${fmtDate(booking.booking_date)} • ${booking.booking_time || "-"}`;
  const canMessage = !!normalizePhoneToID(mua?.phone || null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Header mini */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => {
            log("back pressed");
            router.back();
          }}
        >
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
                log("share pressed", { inv, title, total: computed.grand });
                await Share.share({
                  message: `Invoice ${inv}\n${title}\nTotal ${formatIDR(computed.grand)}`,
                });
              } catch (err: any) {
                error("share error", err?.message || err);
                debugAlert("Share error", err?.message || err);
              }
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

      {/* Ringkasan pembayaran + CTA */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ringkasan Pembayaran</Text>

        <Row label="Subtotal" value={formatIDR(computed.subtotal)} />
        <Row label="Diskon" value={`- ${formatIDR(computed.discount)}`} />
        <Row label="Pajak" value={formatIDR(computed.taxAmount)} />
        <View style={[styles.divider, { marginVertical: 10 }]} />
        <Row label="Total" value={formatIDR(computed.grand)} bold />

        <View style={{ marginTop: 16, gap: 10 }}>
          {/* Copy tanpa Alert sukses */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: PURPLE }]}
            onPress={async () => {
              try {
                log("copy invoice pressed", inv);
                await Clipboard.setStringAsync(inv);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch (err: any) {
                error("copy invoice error", err?.message || err);
                debugAlert("Copy invoice gagal", err?.message || err);
              }
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Salin No. Invoice</Text>
          </TouchableOpacity>
          {copied ? <Text style={styles.copiedText}>Tersalin</Text> : null}

          {/* Pesan Sekarang */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: canMessage ? "#25D366" : "#C7C7C7" }]}
            onPress={onPressPesan}
            disabled={!canMessage}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {canMessage ? "Pesan Sekarang (WhatsApp)" : "Nomor WA tidak tersedia"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#F3F4F6" }]}
            onPress={() => {
              log("back to list pressed");
              router.replace("/(user)/(tabs)/booking");
            }}
          >
            <Text style={{ color: "#111827", fontWeight: "800" }}>Kembali ke Pesanan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

/* ============== Small Row ============== */
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

/* ============== Styles ============== */
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

  copiedText: {
    alignSelf: "center",
    marginTop: -6,
    marginBottom: 6,
    fontSize: 12,
    color: "#10B981",
    fontWeight: "700",
  },
});
