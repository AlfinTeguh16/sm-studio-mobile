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
  mua_id: string;
  name_offer: string;
  offer_pictures?: string[];
  price?: string | number;
  makeup_type?: string | null;
};

type Me = { id?: string; name?: string; profile?: { id?: string; name?: string } };

/* ========= Const ========= */
const API_BASE = "https://smstudio.my.id/api";
const API_OFFERINGS = `${API_BASE}/offerings`;
const API_BOOKINGS = `${API_BASE}/bookings`;
const API_ME = `${API_BASE}/auth/me`;

const PURPLE = "#AA60C8";
const TEXT_MUTED = "#6B7280";
const CARD_BG = "#F7F0FF";
const BORDER = "#E5E7EB";

/* ========= Helpers ========= */
const formatIDR = (n: number) =>
  `IDR ${new Intl.NumberFormat("id-ID").format(Math.round(isFinite(n) ? n : 0))}`;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const hm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/* ========= Screen ========= */
export default function BookingCreateScreen() {
  const router = useRouter();
  const { offeringId } = useLocalSearchParams<{ offeringId?: string }>();

  // auth + me
  const [token, setToken] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // offering
  const [item, setItem] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);

  // form
  const [person, setPerson] = useState(1); // <— jumlah orang, DIKIRIM sebagai `person`
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
  const priceNum = useMemo(() => Number(item?.price ?? 0), [item]);
  const subTotal = useMemo(() => Math.max(1, person) * priceNum, [person, priceNum]);
  const TAX_PERCENT = 11;
  const taxAmount = useMemo(() => (subTotal * TAX_PERCENT) / 100, [subTotal]);
  const grandTotal = useMemo(() => subTotal + taxAmount, [subTotal, taxAmount]);

  // token + me
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
          const id = auth?.user?.id || auth?.profile?.id;
          if (id) setCustomerId(String(id));
        }
      } catch {}
      try {
        const res = await fetch(API_ME, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const me: Me = await res.json();
          const id = me?.id || me?.profile?.id;
          if (id) setCustomerId(String(id));
        }
      } catch {}
    })();
  }, [token]);

  // GET offering (pakai token kalau endpoint butuh auth)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!offeringId) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_OFFERINGS}/${offeringId}`, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json();
        const data: Offering = json?.data ?? json;
        if (mounted) setItem(data);
      } catch (e: any) {
        Alert.alert("Gagal", e?.message || "Tidak bisa memuat data offering");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [offeringId, token]);

  // POST booking
  async function submit() {
    try {
      if (!item) throw new Error("Offering tidak ditemukan");
      if (!customerId) throw new Error("Akun belum dikenali, silakan login ulang");
      if (serviceType === "home_service" && !address.trim()) {
        throw new Error("Alamat wajib diisi untuk Home Service.");
      }

      const payload = {
        customer_id: customerId,
        mua_id: item.mua_id,
        offering_id: item.id,
        booking_date: ymd(date),
        booking_time: hm(date),
        service_type: serviceType,
        location_address: serviceType === "home_service" ? address : null,
        notes: notes || null,

        // tambahan baru
        person: Math.max(1, person),

        // invoice meta (opsional)
        invoice_date: ymd(new Date()),
        due_date: ymd(date),

        // pricing
        amount: subTotal,           // harga x person
        selected_add_ons: [],
        discount_amount: 0,
        tax: TAX_PERCENT,           // persen

        // pembayaran manual
        payment_method: "manual",
      };

      const res = await fetch(API_BOOKINGS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Gagal membuat booking. Pastikan data sudah benar.");
      }

      Alert.alert(
        "Berhasil",
        `Pesanan dibuat.\nNomor Invoice: ${data?.invoice_number || "-"}\nTotal: ${formatIDR(
          Number(data?.grand_total ?? grandTotal)
        )}`,
        [
          {
            text: "Lihat Invoice",
            onPress: () => {
              // arahkan ke halaman invoice/bookings detail
              const id = String(data?.id ?? "");
              if (id) router.replace({ pathname: "/(user)/bookings/[id]", params: { id } });
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa mengirim booking.");
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
            <Text style={styles.vendor}>SM Studio</Text>
          </View>
        </View>

        {/* jumlah orang */}
        <View style={styles.rowBetween}>
          <Text style={styles.formLabel}>Jumlah Orang</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => setPerson((v) => Math.max(1, v - 1))}
            >
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
          <TouchableOpacity
            style={styles.dateBtn}
            onPress={() => setShowPicker(showPicker ? null : "date")}
          >
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
              style={[
                styles.segment,
                serviceType === t && { backgroundColor: PURPLE, borderColor: PURPLE },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  serviceType === t && { color: "#fff", fontWeight: "800" },
                ]}
              >
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
  sumVal: { color: "#111827" },

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
