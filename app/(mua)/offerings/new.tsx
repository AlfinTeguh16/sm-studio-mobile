// app/(mua)/offerings/new.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import DateTimePicker from "@react-native-community/datetimepicker";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";
const TEXT_MUTED = "#6B7280";

type Me = { id?: string; profile?: { id?: string } };

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function OfferingCreate() {
  const router = useRouter();

  // auth
  const [token, setToken] = useState<string | null>(null);
  const [muaId, setMuaId] = useState<string | null>(null);

  // form states
  const [nameOffer, setNameOffer] = useState("");
  const [makeupType, setMakeupType] = useState<"bridal" | "party" | "photoshoot" | "graduation" | "sfx" | "">("");
  const [person, setPerson] = useState(1);

  const [useDate, setUseDate] = useState(false);
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [priceStr, setPriceStr] = useState("");
  const priceNum = useMemo(() => Number(priceStr.replace(/[^\d.]/g, "")) || 0, [priceStr]);

  const [collabName, setCollabName] = useState("");
  const [collabPriceStr, setCollabPriceStr] = useState("");
  const collabPriceNum = useMemo(
    () => (collabName.trim() ? Number(collabPriceStr.replace(/[^\d.]/g, "")) || 0 : null),
    [collabName, collabPriceStr]
  );

  const [photos, setPhotos] = useState<string[]>([""]);
  const [addons, setAddons] = useState<string[]>([]);
  const [addonInput, setAddonInput] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // ambil token & muaId
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth").catch(() => null);
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
          const id = auth?.profile?.id || auth?.user?.id;
          if (id) setMuaId(String(id));
        }
      } catch {}
      if (!muaId) {
        try {
          const res = await fetch(`${API}/auth/me`, {
            headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          if (res.ok) {
            const me: Me = await res.json();
            const id = me?.profile?.id || me?.id;
            if (id) setMuaId(String(id));
          }
        } catch {}
      }
    })();
  }, [token, muaId]);

  function updatePhoto(index: number, value: string) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }
  function addPhotoField() {
    setPhotos((prev) => (prev.length >= 10 ? prev : [...prev, ""]));
  }
  function removePhotoField(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function addAddon() {
    const v = addonInput.trim();
    if (!v) return;
    setAddons((prev) => Array.from(new Set([...prev, v])).slice(0, 20));
    setAddonInput("");
  }
  function removeAddon(v: string) {
    setAddons((prev) => prev.filter((x) => x !== v));
  }

  async function submit() {
    try {
      if (!muaId) throw new Error("Akun MUA belum terdeteksi. Silakan login ulang.");
      if (!nameOffer.trim()) throw new Error("Nama paket wajib diisi.");
      if (!priceNum || priceNum <= 0) throw new Error("Harga tidak valid.");
      if (person < 1) throw new Error("Jumlah orang minimal 1.");
      if (collabName.trim() && (collabPriceNum == null || collabPriceNum < 0)) {
        throw new Error("Harga kolaborasi tidak valid.");
      }

      const cleanPhotos = photos.map((s) => s.trim()).filter((s) => s !== "");
      const payload: any = {
        mua_id: muaId,
        name_offer: nameOffer.trim(),
        offer_pictures: cleanPhotos.length ? cleanPhotos : null,
        makeup_type: makeupType || null,
        person,
        collaboration: collabName.trim() || null,
        collaboration_price: collabName.trim() ? collabPriceNum : null,
        add_ons: addons.length ? addons : null,
        date: useDate ? toYMD(date) : null, // kolom di DB bertipe date (nullable)
        price: priceNum,
      };

      setSubmitting(true);
      const res = await fetch(`${API}/offerings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json?.message ||
          (Array.isArray(json?.errors) ? json.errors.join(", ") : "") ||
          "Gagal menyimpan offering.";
        throw new Error(msg);
      }

      Alert.alert("Berhasil", "Offering berhasil dibuat.", [
        {
          text: "Lihat",
          onPress: () =>
            router.replace({
              pathname: "/(mua)/offerings/[id]",
              params: { id: String(json?.id || json?.data?.id || "") },
            }),
        },
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan offering.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={18} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buat Offering</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Nama Paket */}
          <Text style={styles.label}>Nama Paket *</Text>
          <TextInput
            value={nameOffer}
            onChangeText={setNameOffer}
            placeholder="Contoh: Bridal Package #1"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          {/* Makeup Type */}
          <Text style={[styles.label, { marginTop: 10 }]}>Jenis Make Up</Text>
          <View style={styles.segmentWrap}>
            {(["bridal", "party", "photoshoot", "graduation", "sfx"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setMakeupType(t === makeupType ? "" : t)}
                style={[
                  styles.segment,
                  makeupType === t && { backgroundColor: PURPLE, borderColor: PURPLE },
                ]}
              >
                <Text style={[styles.segmentText, makeupType === t && { color: "#fff", fontWeight: "800" }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Jumlah Orang */}
          <Text style={[styles.label, { marginTop: 10 }]}>Jumlah Orang</Text>
          <View style={styles.rowBetween}>
            <View />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity style={styles.stepper} onPress={() => setPerson((v) => Math.max(1, v - 1))}>
                <Ionicons name="remove" size={16} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontWeight: "800" }}>{person}</Text>
              <TouchableOpacity style={styles.stepper} onPress={() => setPerson((v) => v + 1)}>
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tanggal (opsional) */}
          <Text style={[styles.label, { marginTop: 10 }]}>Tanggal (Opsional)</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              style={[styles.toggle, useDate && { backgroundColor: PURPLE, borderColor: PURPLE }]}
              onPress={() => setUseDate((v) => !v)}
            >
              <Text style={[styles.toggleText, useDate && { color: "#fff", fontWeight: "800" }]}>
                {useDate ? "Aktif" : "Nonaktif"}
              </Text>
            </TouchableOpacity>
            {useDate && (
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#111" />
                <Text style={{ fontWeight: "700", marginLeft: 6 }}>
                  {date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, d) => {
                if (d) setDate(d);
                setShowDatePicker(false);
              }}
            />
          )}

          {/* Harga */}
          <Text style={[styles.label, { marginTop: 10 }]}>Harga *</Text>
          <TextInput
            value={priceStr}
            onChangeText={setPriceStr}
            placeholder="cth: 1500000"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            keyboardType="numeric"
          />

          {/* Kolaborasi */}
          <Text style={[styles.label, { marginTop: 10 }]}>Kolaborasi (opsional)</Text>
          <TextInput
            value={collabName}
            onChangeText={setCollabName}
            placeholder="Nama partner/brand"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />
          {collabName.trim() ? (
            <>
              <Text style={[styles.label, { marginTop: 6 }]}>Harga Kolaborasi</Text>
              <TextInput
                value={collabPriceStr}
                onChangeText={setCollabPriceStr}
                placeholder="cth: 300000"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                keyboardType="numeric"
              />
            </>
          ) : null}

          {/* Foto (URL) */}
          <Text style={[styles.label, { marginTop: 10 }]}>Foto (URL)</Text>
          {photos.map((url, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <TextInput
                value={url}
                onChangeText={(v) => updatePhoto(idx, v)}
                placeholder="https://..."
                placeholderTextColor="#9CA3AF"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => removePhotoField(idx)}
                style={[styles.iconBtn, { marginLeft: 8, backgroundColor: "#FEE2E2" }]}
              >
                <Ionicons name="trash" size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={addPhotoField} style={styles.addLineBtn}>
            <Ionicons name="add" size={16} color={PURPLE} />
            <Text style={{ color: PURPLE, fontWeight: "800", marginLeft: 6 }}>Tambah URL Foto</Text>
          </TouchableOpacity>

          {/* Add-ons */}
          <Text style={[styles.label, { marginTop: 10 }]}>Add-ons</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              value={addonInput}
              onChangeText={setAddonInput}
              placeholder="cth: Hair styling"
              placeholderTextColor="#9CA3AF"
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={addAddon}
            />
            <TouchableOpacity onPress={addAddon} style={[styles.iconBtn, { marginLeft: 8 }]}>
              <Ionicons name="add" size={16} color="#111" />
            </TouchableOpacity>
          </View>
          {addons.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {addons.map((a) => (
                <View key={a} style={styles.chip}>
                  <Text style={styles.chipText}>{a}</Text>
                  <TouchableOpacity onPress={() => removeAddon(a)} style={{ marginLeft: 6 }}>
                    <Ionicons name="close" size={12} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: TEXT_MUTED, marginTop: 6 }}>Belum ada add-ons.</Text>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.cta} disabled={submitting} onPress={submit}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "800" }}>Simpan Offering</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 14, android: 10 }),
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },

  card: {
    margin: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },

  label: { fontWeight: "800", color: "#111827", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#fff",
    color: "#111",
    marginBottom: 8,
  },

  segmentWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segment: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  segmentText: { color: "#111827", fontWeight: "700" },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },

  toggle: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  toggleText: { color: "#111827", fontWeight: "700" },

  dateBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
  },

  addLineBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: { color: "#111827", fontWeight: "600" },

  cta: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    height: 50,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
});
