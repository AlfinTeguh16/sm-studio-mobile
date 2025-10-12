// app/(mua)/offerings/[id].edit.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

const API = "https://smstudio.my.id/api";
const BASE = API.replace(/\/api$/, "");
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";
const TEXT_MUTED = "#6B7280";

type Offering = {
  id: string | number;
  mua_id: string;
  name_offer: string;
  offer_pictures: string[] | null;
  makeup_type?: string | null;
  person?: number | null;
  collaboration?: string | null;
  collaboration_price?: number | null;
  add_ons?: string[] | null;
  price: number;
  date?: string | null;
};

type LocalImage = { uri: string; name: string; type: string };

// util tanggal
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// kompres ringan biar nyaman di backend
async function compressImage(uri: string): Promise<LocalImage> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: out.uri, name: `photo_${Date.now()}.jpg`, type: "image/jpeg" };
}

export default function OfferingEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nameOffer, setNameOffer] = useState("");
  const [makeupType, setMakeupType] = useState<
    "bridal" | "party" | "photoshoot" | "graduation" | "sfx" | ""
  >("");
  const [person, setPerson] = useState(1);

  const [useDate, setUseDate] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [priceStr, setPriceStr] = useState("");
  const priceNum = useMemo(() => Number(priceStr.replace(/[^\d]/g, "")) || 0, [priceStr]);

  const [collabName, setCollabName] = useState("");
  const [collabPriceStr, setCollabPriceStr] = useState("");
  const collabPriceNum = useMemo(
    () => (collabName.trim() ? Number(collabPriceStr.replace(/[^\d]/g, "")) || 0 : null),
    [collabName, collabPriceStr]
  );

  const [serverPhotos, setServerPhotos] = useState<string[]>([]);
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [addons, setAddons] = useState<string[]>([]);
  const [addonInput, setAddonInput] = useState("");

  // ambil token
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth").catch(() => null);
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
        }
      } catch {}
    })();
  }, []);

  // GET data offering
  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        setLoading(true);
        const res = await fetch(`${API}/offerings/${encodeURIComponent(String(id))}`, {
          headers: { Accept: "application/json" },
        });
        const j: Offering = await res.json();
        if (!res.ok) throw new Error(j as any);

        setNameOffer(j.name_offer ?? "");
        setMakeupType(((j.makeup_type || "") as any) as typeof makeupType);
        setPerson(j.person || 1);
        setPriceStr(String(Math.round(j.price ?? 0)));
        setCollabName(j.collaboration || "");
        setCollabPriceStr(String(Math.round(j.collaboration_price || 0) || ""));
        setServerPhotos(Array.isArray(j.offer_pictures) ? j.offer_pictures : []);
        setAddons(Array.isArray(j.add_ons) ? j.add_ons : []);

        if (j.date) {
          const [Y, M, D] = j.date.split("-").map(Number);
          if (Y && M && D) {
            setUseDate(true);
            setDate(new Date(Y, M - 1, D));
          }
        } else {
          setUseDate(false);
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Tidak bisa memuat offering.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // pilih gambar (akan ikut dikirim saat Simpan)
  const pickImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Izin dibutuhkan", "Izinkan akses galeri.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      selectionLimit: 10,
    });
    if (result.canceled) return;

    const mapped: LocalImage[] = (result.assets || [])
      .slice(0, 10)
      .map((a, i) => {
        const name =
          a.fileName ||
          `photo_${Date.now()}_${i}.${(a.uri.split(".").pop() || "jpg").replace(/\?.*$/, "")}`;
        const type =
          a.mimeType ||
          (name.toLowerCase().endsWith(".png")
            ? "image/png"
            : name.toLowerCase().endsWith(".webp")
            ? "image/webp"
            : "image/jpeg");
        return { uri: a.uri, name, type };
      });
    setLocalImages((prev) => [...prev, ...mapped].slice(0, 50));
  }, []);
  const removeLocalImage = (idx: number) =>
    setLocalImages((prev) => prev.filter((_, i) => i !== idx));

  // hapus 1 foto lama di server
  async function deleteServerPictureByIndex(idx: number) {
    try {
      if (!token) throw new Error("Harap login.");
      if (!id) throw new Error("Offering tidak valid.");

      const fd = new FormData();
      (fd as any).append("_method", "DELETE");
      (fd as any).append("index", String(idx));
      (fd as any).append("also_delete_files", "1");

      const res = await fetch(
        `${API}/offerings/${encodeURIComponent(String(id))}/pictures`,
        {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: fd as any, // JANGAN set Content-Type manual
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || j?.error || "Gagal menghapus foto.");
      const updated: Offering = j;
      setServerPhotos(Array.isArray(updated.offer_pictures) ? updated.offer_pictures : []);
      Alert.alert("Berhasil", "Foto dihapus.");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa menghapus foto.");
    }
  }

  // add-ons sederhana
  function addAddon() {
    const v = addonInput.trim();
    if (!v) return;
    setAddons((prev) => Array.from(new Set([...prev, v])).slice(0, 50));
    setAddonInput("");
  }
  function removeAddon(v: string) {
    setAddons((prev) => prev.filter((x) => x !== v));
  }

  // SIMPAN PERUBAHAN: kirim field + file sekaligus
  async function saveAll() {
    try {
      if (!token) throw new Error("Harap login.");
      if (!id) throw new Error("Offering tidak valid.");
      if (!nameOffer.trim()) throw new Error("Nama paket wajib diisi.");
      if (!priceNum || priceNum <= 0) throw new Error("Harga tidak valid.");
      if (person < 1) throw new Error("Jumlah orang minimal 1.");
      if (collabName.trim() && (collabPriceNum == null || collabPriceNum < 0))
        throw new Error("Harga kolaborasi tidak valid.");

      setSaving(true);

      // multipart
      const fd = new FormData();
      (fd as any).append("_method", "PATCH"); // penting utk Laravel
      (fd as any).append("name_offer", nameOffer.trim());
      (fd as any).append("makeup_type", makeupType || "");
      (fd as any).append("person", String(person));
      (fd as any).append("price", String(priceNum));
      (fd as any).append("date", useDate ? toYMD(date) : "");

      (fd as any).append("collaboration", collabName.trim());
      if (collabName.trim())
        (fd as any).append("collaboration_price", String(collabPriceNum ?? 0));

      addons.forEach((a) => (fd as any).append("add_ons[]", a));

      // kompres & lampirkan file baru (kalau ada)
      for (const f of localImages) {
        const c = await compressImage(f.uri);
        (fd as any).append("offer_images[]", {
          uri: c.uri,
          name: f.name.endsWith(".jpg") || f.name.endsWith(".jpeg") ? f.name : c.name,
          type: "image/jpeg",
        } as any);
      }

      const res = await fetch(`${API}/offerings/${encodeURIComponent(String(id))}`, {
        method: "POST", // POST + _method=PATCH
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: fd as any, // ❗JANGAN set Content-Type manual
      });

      const j: Offering = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error((j as any)?.message || (j as any)?.error || "Gagal menyimpan perubahan.");

      // refresh state dari response server
      setServerPhotos(Array.isArray(j.offer_pictures) ? j.offer_pictures : []);
      setLocalImages([]);
      Alert.alert("Sukses", "Perubahan disimpan.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan perubahan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ marginTop: 8, color: TEXT_MUTED }}>Memuat…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={18} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Offering</Text>
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

          {/* Jenis Makeup */}
          <Text style={[styles.label, { marginTop: 10 }]}>Jenis Make Up</Text>
          <View style={styles.segmentWrap}>
            {(["bridal", "party", "photoshoot", "graduation", "sfx"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setMakeupType(t === makeupType ? "" : t)}
                style={[styles.segment, makeupType === t && { backgroundColor: PURPLE, borderColor: PURPLE }]}
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

          {/* Tanggal */}
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
            onChangeText={(t) => setPriceStr(t.replace(/[^\d]/g, ""))}
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
                onChangeText={(t) => setCollabPriceStr(t.replace(/[^\d]/g, ""))}
                placeholder="cth: 300000"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                keyboardType="numeric"
              />
            </>
          ) : null}

          {/* Foto dari server */}
          <Text style={[styles.label, { marginTop: 14 }]}>Foto Saat Ini</Text>
          {serverPhotos.length > 0 ? (
            <View style={{ gap: 10 }}>
              {serverPhotos.map((p, idx) => (
                <View key={`${p}-${idx}`}>
                  <Image
                    source={{ uri: p.startsWith("/storage/") ? `${BASE}${p}` : p }}
                    style={{ width: "100%", height: 180, borderRadius: 10, backgroundColor: "#f3f4f6" }}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
                    <TouchableOpacity
                      onPress={() => deleteServerPictureByIndex(idx)}
                      style={[styles.iconBtn, { backgroundColor: "#fee2e2" }]}
                    >
                      <Ionicons name="trash" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: TEXT_MUTED, marginTop: 6 }}>Belum ada foto.</Text>
          )}

          {/* Tambah foto baru (ikut terkirim saat Simpan) */}
          <Text style={[styles.label, { marginTop: 14 }]}>Tambah Foto</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity onPress={pickImages} style={styles.addLineBtn}>
              <Ionicons name="images" size={16} color={PURPLE} />
              <Text style={{ color: PURPLE, fontWeight: "800", marginLeft: 6 }}>Pilih Foto</Text>
            </TouchableOpacity>
          </View>
          {localImages.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {localImages.map((img, i) => (
                <View key={`${img.uri}-${i}`} style={styles.thumb}>
                  <Image source={{ uri: img.uri }} style={{ width: 78, height: 78, borderRadius: 8 }} />
                  <TouchableOpacity onPress={() => removeLocalImage(i)} style={styles.thumbRemove}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: TEXT_MUTED, marginTop: 6 }}>Belum ada foto baru.</Text>
          )}

          {/* Add-ons (opsional UI sederhana) */}
          <Text style={[styles.label, { marginTop: 14 }]}>Add-ons</Text>
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
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
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

      <TouchableOpacity style={[styles.cta, saving && { opacity: 0.6 }]} disabled={saving} onPress={saveAll}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Simpan Perubahan</Text>}
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

  thumb: {
    position: "relative",
    width: 78,
    height: 78,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },
  thumbRemove: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "center",
  },
});
