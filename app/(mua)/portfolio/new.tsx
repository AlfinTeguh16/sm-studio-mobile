import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

type Me = { id?: string; profile?: { id?: string } };

export default function PortfolioCreate() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [muaId, setMuaId] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [makeupType, setMakeupType] = useState("");
  const [collab, setCollab] = useState("");
  const [photos, setPhotos] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

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
          const res = await fetch(`${API}/auth/me`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
          const me: Me = await res.json();
          setMuaId(me?.profile?.id || me?.id || null);
        } catch {}
      }
    })();
  }, [token]);

  function setPhotoAt(i: number, v: string) {
    setPhotos((arr) => arr.map((x, idx) => (idx === i ? v : x)));
  }
  function addPhoto() {
    setPhotos((arr) => (arr.length >= 10 ? arr : [...arr, ""]));
  }
  function removePhoto(i: number) {
    setPhotos((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function submit() {
    try {
      if (!muaId) throw new Error("Akun MUA tidak dikenali.");
      if (!name.trim()) throw new Error("Nama portofolio wajib diisi.");

      const cleanPhotos = photos.map((s) => s.trim()).filter(Boolean);

      const payload = {
        mua_id: muaId,
        name: name.trim(),
        photos: cleanPhotos,
        makeup_type: makeupType.trim() || null,
        collaboration: collab.trim() || null,
      };

      setSaving(true);
      const res = await fetch(`${API}/portfolios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Gagal menyimpan portofolio.");

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
        <TextInput style={styles.input} placeholder="Contoh: Bridal Natural"
          value={name} onChangeText={setName} />

        <Text style={styles.label}>Tipe Make Up (opsional)</Text>
        <TextInput style={styles.input} placeholder="graduation / party / bridal / sfx"
          value={makeupType} onChangeText={setMakeupType} autoCapitalize="none" />

        <Text style={styles.label}>Kolaborasi (opsional)</Text>
        <TextInput style={styles.input} placeholder="Nama partner/brand"
          value={collab} onChangeText={setCollab} />

        <Text style={[styles.label, { marginBottom: 6 }]}>Foto (URL)</Text>
        {photos.map((p, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 8 }]}
              placeholder="https://..."
              value={p}
              onChangeText={(v) => setPhotoAt(i, v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {photos.length > 1 && (
              <TouchableOpacity onPress={() => removePhoto(i)} style={styles.iconBtn}>
                <Ionicons name="trash" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity onPress={addPhoto} style={[styles.secondaryBtn, { alignSelf: "flex-start" }]}>
          <Ionicons name="add" size={16} color={PURPLE} />
          <Text style={{ color: PURPLE, fontWeight: "700", marginLeft: 6 }}>Tambah URL Foto</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={saving}>
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
    borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, height: 46, backgroundColor: "#fff", color: "#111",
  },
  primaryBtn: {
    marginTop: 16, height: 50, borderRadius: 12, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center",
  },
  iconBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
});
