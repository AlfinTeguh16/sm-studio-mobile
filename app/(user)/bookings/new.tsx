// app/(user)/bookings/new.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import DateTimePicker from "@react-native-community/datetimepicker";

/* ========= Types ========= */
type Offering = {
  id: number;
  mua_id?: string; // UUID (optional; hanya fallback)
  name_offer: string;
  offer_pictures?: string[];
  price?: string | number;
  makeup_type?: string | null;

  // dari backend (opsi A: JOIN profiles p.name as mua_name, p.photo_url as mua_photo)
  mua_name?: string;
  mua_photo?: string;

  // kemungkinan backend pakai include relasi
  mua?: { id?: string; name?: string } | null;
};

type Me = {
  id?: string | number;
  profile?: { id?: string; name?: string };
  name?: string;
};

type MuaProfile = { id?: string; name?: string | null };

/* ========= Const ========= */
const API_BASE = "https://smstudio.my.id/api";
const API_OFFERINGS = `${API_BASE}/offerings`;
const API_BOOKINGS  = `${API_BASE}/bookings`;
const API_ME        = `${API_BASE}/auth/me`;
const API_MUAS      = `${API_BASE}/mua-location`; // fallback terakhir

const PURPLE     = "#AA60C8";
const TEXT_MUTED = "#6B7280";
const CARD_BG    = "#F7F0FF";
const BORDER     = "#E5E7EB";

/* ========= Helpers ========= */
const formatIDR = (n: number) =>
  `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(isFinite(n) ? n : 0))}`;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const hm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getTokenAndCustomerUUID(): Promise<{ token: string | null; customerUUID: string | null }> {
  let token: string | null = null;
  let customerUUID: string | null = null;

  // Ambil dari SecureStore (jaga-jaga)
  const raw = await SecureStore.getItemAsync("auth");
  if (raw) {
    try {
      const auth = JSON.parse(raw);
      token = auth?.token ?? null;
      const maybeProfile = auth?.profile?.id || auth?.user?.profile?.id;
      if (maybeProfile && uuidRe.test(String(maybeProfile))) {
        customerUUID = String(maybeProfile);
      }
    } catch {}
  }

  // GET /auth/me untuk konfirmasi profile.id
  try {
    const res = await fetch(API_ME, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.ok) {
      const me: Me = await res.json();
      const profId = me?.profile?.id;
      if (profId && uuidRe.test(String(profId))) {
        customerUUID = String(profId);
      }
    }
  } catch {}

  return { token, customerUUID };
}

/** POST + ekstraksi error Laravel */
async function postJSONLogged<T = any>(url: string, headers: Record<string, string>, body: any): Promise<T> {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const ct = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let details = "";
    try {
      if (ct.includes("json")) {
        const j = JSON.parse(raw);
        msg = j.message || j.error || msg;
        if (j.errors && typeof j.errors === "object") {
          details = Object.entries(j.errors)
            .map(([k, v]) => `${k}: ${(v as any[]).join(", ")}`)
            .join("\n");
        }
      } else {
        details = raw.slice(0, 800);
      }
    } catch {
      details = raw.slice(0, 800);
    }
    throw new Error([msg, details].filter(Boolean).join("\n"));
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/* ========= Screen ========= */
export default function BookingCreateScreen() {
  const router = useRouter();
  const { offeringId } = useLocalSearchParams<{ offeringId?: string }>();

  // auth + me
  const [token, setToken] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null); // UUID

  // offering
  const [item, setItem] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);

  // nama vendor (MUA) — resolver fallback
  const [vendorName, setVendorName] = useState<string>("");
  const [vendorLoading, setVendorLoading] = useState<boolean>(false);

  // form
  const [person, setPerson] = useState(1);
  const [serviceType, setServiceType] = useState<"home_service" | "studio">("home_service");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // default besok
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState<null | "date" | "time">(null);

  // harga
  const priceNum   = useMemo(() => Number(item?.price ?? 0), [item]);
  const subTotal   = useMemo(() => Math.max(1, person) * priceNum, [person, priceNum]);
  const TAX_PERCENT = 11;
  const taxAmount  = useMemo(() => (subTotal * TAX_PERCENT) / 100, [subTotal]);
  const grandTotal = useMemo(() => subTotal + taxAmount, [subTotal, taxAmount]);

  // token + me (pastikan customerId = UUID)
  useEffect(() => {
    (async () => {
      const { token: tk, customerUUID } = await getTokenAndCustomerUUID();
      if (tk) setToken(tk);
      if (customerUUID) setCustomerId(customerUUID);
    })();
  }, []);

  // GET offering
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!offeringId) return;
      setLoading(true);
      setVendorLoading(true); // mulai loading nama MUA
  
      try {
        const res = await fetch(`${API_OFFERINGS}/${offeringId}`, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json().catch(() => ({}));
        const data: Offering = json?.data ?? json;
  
        if (!mounted) return;
        setItem(data);
  
        // 1) coba ambil dari payload offering (mua_name / relasi mua?.name)
        const fromOffering =
          (data as any)?.mua_name ||
          (data as any)?.mua?.name ||
          "";
  
        if (typeof fromOffering === "string" && fromOffering.trim()) {
          setVendorName(fromOffering.trim());
          setVendorLoading(false);
        } else {
          // 2) resolve by offeringId (tanpa fallback "SM Studio")
          const nm = await resolveVendorNameByOfferingId(String(offeringId), token, data?.mua_id);
          if (mounted) {
            setVendorName(nm || ""); // tetap kosong jika gagal
            setVendorLoading(false);
          }
        }
      } catch {
        if (mounted) {
          setVendorName("");
          setVendorLoading(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [offeringId, token]);

  // === Nama MUA untuk ditampilkan: prioritaskan dari backend (mua_name), lalu relasi, lalu resolver ===
  const displayVendor = useMemo(() => {
    return (
      item?.mua_name?.trim?.() ||
      item?.mua?.name?.trim?.() ||
      vendorName?.trim?.() ||
      ""
    );
  }, [item, vendorName]);
  
  // === resolver vendor berdasarkan OFFERING ID ===
  async function resolveVendorNameByOfferingId(offId: string, authToken: string | null, fallbackMuaId?: string | undefined) {
    setVendorLoading(true);
    const authHeader = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;

    // 1) Coba /offerings/:id?include=mua → data.mua.name
    try {
      const r1 = await fetch(`${API_OFFERINGS}/${offId}?include=mua`, { headers: { Accept: "application/json", ...authHeader } as any });
      if (r1.ok) {
        const j1 = await r1.json().catch(() => ({}));
        const name = (j1?.data?.mua?.name || j1?.mua?.name || "").trim?.();
        if (name) return name;
      }
    } catch {}

    // 2) Coba /offerings/:id/mua → { name }
    try {
      const r2 = await fetch(`${API_OFFERINGS}/${offId}/mua`, { headers: { Accept: "application/json", ...authHeader } as any });
      if (r2.ok) {
        const j2 = await r2.json().catch(() => ({}));
        const data: MuaProfile = j2?.data ?? j2;
        const name = (data?.name || "").trim?.();
        if (name) return name;
      }
    } catch {}

    // 3) Fallback terakhir: kalau offering punya mua_id → /mua-location/:mua_id
    try {
      if (fallbackMuaId && uuidRe.test(String(fallbackMuaId))) {
        const r3 = await fetch(`${API_MUAS}/${fallbackMuaId}`, { headers: { Accept: "application/json", ...authHeader } as any });
        if (r3.ok) {
          const j3 = await r3.json().catch(() => ({}));
          const data: MuaProfile = j3?.data ?? j3;
          const name = (data?.name || "").trim?.();
          if (name) return name;
        }
      }
    } catch {}

    setVendorLoading(false);
    return null;
  }

  // POST booking
  async function submit() {
    try {
      if (!item) throw new Error("Offering tidak ditemukan");
      if (!customerId || !uuidRe.test(customerId)) {
        throw new Error("Akun belum dikenali (customer_id bukan UUID). Silakan login ulang.");
      }
      // pada alur ini, kita tetap kirim mua_id jika tersedia (backend biasanya minta)
      if (item.mua_id && !uuidRe.test(item.mua_id)) {
        throw new Error("Data MUA tidak valid (mua_id bukan UUID).");
      }
      if (serviceType === "home_service" && !address.trim()) {
        throw new Error("Alamat wajib diisi untuk Home Service.");
      }

      const today = new Date();
      const payload: any = {
        customer_id: customerId,           // UUID
        offering_id: Number(item.id),      // integer
        booking_date: ymd(date),           // YYYY-MM-DD
        booking_time: hm(date),            // HH:mm
        person: Math.max(1, person),
        service_type: serviceType,
        location_address: serviceType === "home_service" ? address : null,
        notes: notes || null,

        // invoice meta
        invoice_date: ymd(today),
        due_date: ymd(date),

        // pricing
        amount: Number(subTotal),
        tax: 11, // %

        payment_method: "manual",
      };

      // Jika backend tetap butuh mua_id, isi bila ada
      if (item.mua_id && uuidRe.test(item.mua_id)) {
        payload.mua_id = item.mua_id;
      }

      // bersihkan field kosong
      Object.keys(payload).forEach((k) => {
        if (
          payload[k] === undefined ||
          payload[k] === "" ||
          payload[k] === null ||
          (Array.isArray(payload[k]) && payload[k].length === 0)
        ) {
          delete payload[k];
        }
      });

      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const result = await postJSONLogged<{ data?: { id: number | string } }>(API_BOOKINGS, headers, payload);
      const bookingId = result?.data?.id ?? (result as any)?.id;
      if (!bookingId) {
        Alert.alert("Gagal", "Server tidak mengembalikan ID booking.");
        return;
      }

      router.replace(`/(user)/bookings/${bookingId}`);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Maaf jadwal mua sudah penuh.");
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Text>Tidak ada data.</Text>
      </View>
    );
  }

  const hero = item.offer_pictures?.[0] || "https://via.placeholder.com/600x400.png?text=Offering";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* header back */}
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color="#111" />
        </TouchableOpacity>

        {/* ringkasan offering */}
        <View style={styles.card}>
          <Image source={{ uri: hero }} style={styles.thumb} />
          <View style={{ flex: 1, paddingLeft: 14 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.name_offer || "Paket"}
            </Text>
            <Text style={styles.vendor} numberOfLines={1}>
              {vendorLoading ? "Memuat MUA..." : (displayVendor || "—")}
            </Text>
          </View>
        </View>

        {/* jumlah orang */}
        <View style={styles.rowBetween}>
          <Text style={styles.formLabel}>Jumlah Orang</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity style={styles.stepper} onPress={() => setPerson((v) => Math.max(1, v - 1))}>
              <Ionicons name="remove" size={16} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontWeight: "700" }}>{person}</Text>
            <TouchableOpacity style={styles.stepper} onPress={() => setPerson((v) => v + 1)}>
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* jadwal */}
        <Text style={[styles.formLabel, { marginTop: 14 }]}>Jadwal</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: "#111", fontWeight: "600" }}>
            {`${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} - ${date.toLocaleDateString(
              "id-ID",
              { day: "2-digit", month: "long", year: "numeric" }
            )}`}
          </Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(showPicker ? null : "date")}>
            <Text style={{ fontWeight: "700" }}>Tanggal</Text>
          </TouchableOpacity>
        </View>

        {showPicker && (
          <View style={{ marginTop: 6 }}>
            <DateTimePicker
              value={date}
              mode={showPicker}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, d) => {
                if (!d) return;
                setDate(d);
                if (Platform.OS === "android" && showPicker === "date") {
                  setShowPicker("time");
                } else {
                  setShowPicker(null);
                }
              }}
            />
            {Platform.OS === "ios" && (
              <TouchableOpacity style={styles.dateDone} onPress={() => setShowPicker(null)}>
                <Text style={{ fontWeight: "700" }}>Selesai</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* tipe layanan */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {(["home_service", "studio"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setServiceType(t)}
              style={[styles.segment, serviceType === t && { backgroundColor: PURPLE, borderColor: PURPLE }]}
            >
              <Text style={[styles.segmentText, serviceType === t && { color: "#fff", fontWeight: "800" }]}>
                {t === "home_service" ? "Home Service" : "Studio"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* alamat (user) */}
        <Text style={[styles.formLabel, { marginTop: 14 }]}>Alamat</Text>
        <TextInput
          placeholder="Jl. xxx, Nomor 11, Desa xx, Kec. xx"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          editable={serviceType === "home_service"}
        />

        {/* catatan */}
        <Text style={[styles.formLabel, { marginTop: 10 }]}>Catatan</Text>
        <TextInput
          placeholder="Catatan Pesanan"
          placeholderTextColor="#9CA3AF"
          style={styles.textarea}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        {/* ringkasan */}
        <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Ringkasan Pesanan</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.sumLabel}>Harga Jasa</Text>
          <Text style={styles.sumVal}>{formatIDR(subTotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.sumLabel}>Pajak</Text>
          <Text style={styles.sumVal}>{formatIDR(taxAmount)}</Text>
        </View>
        <View style={[styles.summaryRow, { marginTop: 4 }]}>
          <Text style={[styles.sumLabel, { fontWeight: "800" }]}>Total</Text>
          <Text style={[styles.sumVal, { fontWeight: "800" }]}>{formatIDR(grandTotal)}</Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <TouchableOpacity style={styles.cta} onPress={submit}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Pesan Sekarang</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ========= Styles ========= */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  back: {
    marginTop: Platform.select({ ios: 14, android: 10 }),
    marginLeft: 16,
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#E9DDF7",
    flexDirection: "row",
    alignItems: "center",
  },
  thumb: { width: 88, height: 72, borderRadius: 10, backgroundColor: "#eee" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  vendor: { marginTop: 4, color: TEXT_MUTED },

  formLabel: { marginHorizontal: 16, marginTop: 6, color: "#111827", fontWeight: "700" },
  rowBetween: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },

  dateBtn: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  dateDone: {
    alignSelf: "flex-end",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 16,
  },

  segment: {
    marginLeft: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  segmentText: { color: "#111827", fontWeight: "700" },

  input: {
    marginHorizontal: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: "#111",
    backgroundColor: "#fff",
  },
  textarea: {
    marginHorizontal: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 130,
    padding: 12,
    color: "#111",
    backgroundColor: "#fff",
  },

  sectionTitle: {
    marginHorizontal: 16,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  summaryRow: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sumLabel: { color: "#111827" },
  sumVal:   { color: "#111827" },

  cta: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    height: 52,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
});
