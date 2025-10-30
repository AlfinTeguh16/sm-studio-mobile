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
import * as Clipboard from "expo-clipboard";
import authStorage from "../../../utils/authStorage"; // ✅ GUNAKAN AUTH STORAGE YANG SAMA

/* ============== Debug & Console Helpers ============== */
const DEBUG_ALERT = false; // set ke false saat production
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
function log(...args: any[]) { console.log(LOG_NS, ...args); }
function warn(...args: any[]) { console.warn(LOG_NS, ...args); }
function error(...args: any[]) { console.error(LOG_NS, ...args); }

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

// ✅ GUNAKAN AUTH STORAGE YANG SAMA
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
          Alert.alert("Sesi Berakhir", "Silakan login kembali.", [
            {
              text: "OK",
              onPress: () => {
                router.replace("/(auth)/login");
              }
            }
          ]);
        } else {
          debugAlert("Load invoice gagal", { id, error: e?.message });
          Alert.alert("Error", "Gagal memuat detail booking: " + (e.message || "Unknown error"), [
            {
              text: "Kembali",
              onPress: () => {
                router.replace("/(user)/(tabs)/booking");
              }
            }
          ]);
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

  // WhatsApp CTA
  const onPressPesan = async () => {
    const group = `${LOG_NS} wa:${booking?.id}`;
    console.groupCollapsed(group);
    try {
      if (!mua) {
        warn("MUA belum siap", { bookingId: booking?.id });
        Alert.alert("Info", "Data MUA belum tersedia. Silakan coba lagi nanti.");
        return;
      }
      const intl = normalizePhoneToID(mua.phone || undefined);
      if (!intl) {
        warn("Nomor WA kosong/invalid", { phone: mua?.phone });
        Alert.alert("Info", "Nomor WhatsApp MUA tidak tersedia.");
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
        Alert.alert("Error", "Tidak dapat membuka WhatsApp. Pastikan aplikasi WhatsApp terinstall.");
      }
    } catch (err: any) {
      error("WA open error", err?.message || err);
      Alert.alert("Error", "Gagal membuka WhatsApp: " + (err.message || "Unknown error"));
    } finally {
      console.groupEnd();
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={{ marginTop: 12, color: MUTED }}>Memuat detail booking...</Text>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={64} color={MUTED} />
        <Text style={{ marginTop: 12, color: MUTED, textAlign: "center" }}>
          Tidak dapat memuat data booking
        </Text>
        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 16 }]}
          onPress={() => router.replace("/(user)/(tabs)/booking")}
        >
          <Text style={{ color: PURPLE, fontWeight: "700" }}>Kembali ke Pesanan</Text>
        </TouchableOpacity>
      </View>
    );
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
                Alert.alert("Error", "Gagal berbagi invoice: " + (err.message || "Unknown error"));
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
        {computed.discount > 0 && (
          <Row label="Diskon" value={`- ${formatIDR(computed.discount)}`} />
        )}
        {computed.taxAmount > 0 && (
          <Row label="Pajak" value={formatIDR(computed.taxAmount)} />
        )}
        <View style={[styles.divider, { marginVertical: 10 }]} />
        <Row label="Total" value={formatIDR(computed.grand)} bold />

        <View style={{ marginTop: 16, gap: 10 }}>
          {/* Copy invoice number */}
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
                Alert.alert("Error", "Gagal menyalin invoice: " + (err.message || "Unknown error"));
              }
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {copied ? "Tersalin!" : "Salin No. Invoice"}
            </Text>
          </TouchableOpacity>

          {/* Pesan Sekarang via WhatsApp */}
          <TouchableOpacity
            style={[styles.btn, { 
              backgroundColor: canMessage ? "#25D366" : MUTED,
              opacity: canMessage ? 1 : 0.6
            }]}
            onPress={onPressPesan}
            disabled={!canMessage}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              {canMessage ? "Hubungi MUA via WhatsApp" : "Nomor WA tidak tersedia"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#F3F4F6" }]}
            onPress={() => {
              log("back to list pressed");
              router.replace("/(user)/(tabs)/booking");
            }}
          >
            <Text style={{ color: "#111827", fontWeight: "800" }}>Kembali ke Daftar Pesanan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Informasi tambahan */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Informasi Penting</Text>
        <Text style={styles.infoText}>
          • Simpan nomor invoice untuk referensi pembayaran
        </Text>
        <Text style={styles.infoText}>
          • Hubungi MUA minimal 1 hari sebelum jadwal booking
        </Text>
        <Text style={styles.infoText}>
          • Pembayaran dapat dilakukan via transfer atau cash
        </Text>
        <Text style={styles.infoText}>
          • Batalkan booking minimal 24 jam sebelumnya jika tidak jadi
        </Text>
      </View>
    </ScrollView>
  );
}

/* ============== Small Row ============== */
function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.rowLabel]}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: "800", fontSize: 16 }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/* ============== Styles ============== */
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#fff", 
    paddingTop: Platform.select({ ios: 8, android: 4 }) 
  },

  header: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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
  headerTitle: { 
    fontWeight: "800", 
    fontSize: 18, 
    color: "#111827" 
  },

  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
  },
  rowBetween: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badge: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
  },
  invNo: { 
    fontSize: 22, 
    fontWeight: "800", 
    color: "#111827", 
    marginTop: 8 
  },

  sectionTitle: { 
    fontWeight: "800", 
    color: "#111827", 
    marginBottom: 12,
    fontSize: 18,
  },
  infoTitle: {
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    fontSize: 16,
  },
  infoText: {
    color: MUTED,
    marginBottom: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  title: { 
    fontSize: 18, 
    fontWeight: "800", 
    color: "#111827",
    marginBottom: 4,
  },

  divider: { 
    height: 1, 
    backgroundColor: BORDER, 
    opacity: 0.8 
  },

  rowLabel: { 
    color: MUTED, 
    marginRight: 12,
    fontSize: 14,
  },
  rowValue: { 
    color: "#111827", 
    maxWidth: "60%", 
    textAlign: "right",
    fontSize: 14,
  },

  btn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PURPLE,
    alignItems: "center",
  },
});