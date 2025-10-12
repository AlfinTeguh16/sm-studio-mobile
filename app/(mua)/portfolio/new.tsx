// app/(mua)/portfolios/new.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Platform, Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

type Me = { id?: string; profile?: { id?: string } };
type LocalImage = { uri: string; name: string; type: string };

function uuidLike() {
  // id sederhana untuk korelasi log (opsional)
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Kompres ringan agar unggahan lebih kecil & kompatibel */
async function compressToJpeg(uri: string): Promise<LocalImage> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: out.uri, name: `photo_${Date.now()}.jpg`, type: "image/jpeg" };
}

export default function PortfolioCreate() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [muaId, setMuaId] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [makeupType, setMakeupType] = useState("");
  const [collab, setCollab] = useState("");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [saving, setSaving] = useState(false);

  // ambil auth
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
          setMuaId(auth?.profile?.id || auth?.user?.id || null);
        }
      } catch {}
      if (!muaId) {
        try {
          const res = await fetch(`${API}/auth/me`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (res.ok) {
            const me: Me = await res.json();
            setMuaId(me?.profile?.id || me?.id || null);
          }
        } catch {}
      }
    })();
  }, [token, muaId]);

  const pickImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Izin dibutuhkan", "Izinkan akses galeri untuk memilih foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      selectionLimit: 10,
    });
    if (result.canceled) return;

    const mapped: LocalImage[] = (result.assets || []).slice(0, 10).map((a, i) => {
      const ext = (a.fileName?.split(".").pop() || a.uri.split(".").pop() || "jpg").replace(/\?.*$/, "");
      const name = a.fileName || `photo_${Date.now()}_${i}.${ext}`;
      const lower = name.toLowerCase();
      const type =
        a.mimeType ||
        (lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg");
      return { uri: a.uri, name, type };
    });

    setImages((prev) => [...prev, ...mapped].slice(0, 50));
  }, []);

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const canSubmit = useMemo(() => name.trim().length > 0, [name]);

  async function submit() {
    try {
      if (!muaId) throw new Error("Akun MUA tidak dikenali.");
      if (!name.trim()) throw new Error("Nama portofolio wajib diisi.");

      setSaving(true);

      // Siapkan FormData multipart
      const fd = new FormData();
      // Jangan set Content-Type manual!
      fd.append("mua_id", muaId);
      fd.append("name", name.trim());
      fd.append("makeup_type", makeupType.trim());
      fd.append("collaboration", collab.trim());

      // Kompres dan lampirkan file
      for (const f of images) {
        const c = await compressToJpeg(f.uri);
        fd.append("photos[]", {
          uri: c.uri,
          name: f.name.endsWith(".jpg") || f.name.endsWith(".jpeg") ? f.name : c.name,
          type: "image/jpeg",
        } as any);
      }

      const reqId = uuidLike();
      const res = await fetch(`${API}/portfolios`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Req-Id": reqId, // opsional: bantu korelasi log backend
        },
        body: fd as any,
      });

      const text = await res.text();
      const json = (() => {
        try { return JSON.parse(text); } catch { return null; }
      })();

      if (!res.ok) {
        const msg = json?.message || text || "Gagal menyimpan portofolio.";
        throw new Error(msg);
      }

      Alert.alert("Berhasil", "Portofolio berhasil dibuat.", [
        { text: "OK", onPress: () => router.replace("/(mua)") },
      ]);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <Text style={styles.title}>Tambah Portofolio</Text>

        <Text style={styles.label}>Nama</Text>
        <TextInput
          style={styles.input}
          placeholder="Contoh: Bridal Natural"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Tipe Make Up (opsional)</Text>
        <TextInput
          style={styles.input}
          placeholder="graduation / party / bridal / sfx"
          value={makeupType}
          onChangeText={setMakeupType}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Kolaborasi (opsional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Nama partner/brand"
          value={collab}
          onChangeText={setCollab}
        />

        {/* Pilih foto dari device */}
        <Text style={[styles.label, { marginBottom: 6 }]}>Foto</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <TouchableOpacity onPress={pickImages} style={styles.secondaryBtn}>
            <Ionicons name="images" size={16} color={PURPLE} />
            <Text style={{ color: PURPLE, fontWeight: "700", marginLeft: 6 }}>Pilih Foto</Text>
          </TouchableOpacity>
        </View>

        {images.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {images.map((img, i) => (
              <View key={`${img.uri}-${i}`} style={styles.thumb}>
                <Image source={{ uri: img.uri }} style={{ width: 78, height: 78, borderRadius: 8 }} />
                <TouchableOpacity onPress={() => removeImage(i)} style={styles.thumbRemove}>
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: MUTED, marginTop: 6 }}>Belum ada foto dipilih.</Text>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, (!canSubmit || saving) && { opacity: 0.6 }]}
          onPress={submit}
          disabled={!canSubmit || saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Simpan</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.select({ ios: 8, android: 0 }) },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12, color: "#111827" },
  label: { marginTop: 10, marginBottom: 6, fontWeight: "700", color: "#111827" },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: "#fff",
    color: "#111",
  },
  primaryBtn: {
    marginTop: 16,
    height: 50,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  thumb: {
    position: "relative",
    width: 78,
    height: 78,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F3F4F6",
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
