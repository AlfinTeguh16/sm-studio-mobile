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
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function compressToJpeg(uri: string): Promise<LocalImage> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: out.uri, name: `photo_${Date.now()}.jpg`, type: "image/jpeg" };
}

/** Small helper: read token/profile robustly from SecureStore */
async function bootstrapAuth(): Promise<{ token: string | null; profileId: string | null }> {
  // try multiple keys / shapes
  try {
    // 1. try legacy "auth" key (object or plain)
    const raw = await SecureStore.getItemAsync("auth").catch(() => null);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const token = parsed?.token ?? parsed?.access_token ?? parsed?.accessToken ?? null;
        const profileId = parsed?.profile?.id ?? parsed?.user?.id ?? parsed?.profile_id ?? null;
        if (token || profileId) return { token: token ? String(token) : null, profileId: profileId ? String(profileId) : null };
      } catch {
        // raw might be plain token string
        if (typeof raw === "string" && raw.length > 10) {
          return { token: raw, profileId: null };
        }
      }
    }

    // 2. try separate token key
    const t2 = await SecureStore.getItemAsync("auth_token").catch(() => null);
    if (t2) return { token: t2, profileId: null };

    const t3 = await SecureStore.getItemAsync("token").catch(() => null);
    if (t3) return { token: t3, profileId: null };

    // fallback none
    return { token: null, profileId: null };
  } catch {
    return { token: null, profileId: null };
  }
}

/** Fetch JSON helper that gives clearer error when response is not JSON (redirect/html) */
async function fetchJsonOrThrow(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers || {}) } });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("application/json")) {
    const snippet = (text || "").slice(0, 300).replace(/\s+/g, " ");
    const err: any = new Error(`Expected JSON response from ${url} — got: ${snippet}`);
    err.status = res.status;
    throw err;
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    const err: any = new Error(`Invalid JSON response from ${url}`);
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? `HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
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
  const [booting, setBooting] = useState(true);

  // bootstrap once
  useEffect(() => {
    let mounted = true;
    (async () => {
      setBooting(true);
      try {
        const { token: t, profileId } = await bootstrapAuth();
        if (!mounted) return;
        setToken(t);
        if (profileId) {
          setMuaId(profileId);
          setBooting(false);
          return;
        }
        // if no profileId but we have token, call /auth/me
        if (t) {
          try {
            const json = await fetchJsonOrThrow(`${API}/auth/me`, {
              headers: { Authorization: `Bearer ${t}` },
            });
            if (!mounted) return;
            const me = json?.data ?? json;
            const pid = me?.profile?.id ?? me?.id ?? null;
            if (pid) setMuaId(String(pid));
          } catch (e: any) {
            // token invalid or server returned html (redirect) -> force user to login
            console.warn("bootstrap /auth/me failed:", e?.message || e);
            if (e?.status === 401) {
              // delete stored auth and redirect
              await SecureStore.deleteItemAsync("auth").catch(() => {});
              Alert.alert("Sesi berakhir", "Silakan login kembali.", [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]);
            } else {
              // non-401: show but allow form to continue (user can still submit if they have token)
              Alert.alert("Info", "Tidak dapat memverifikasi profil. Jika masalah berlanjut, login ulang.");
            }
          }
        }
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

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
      if (!muaId) throw new Error("Akun MUA tidak dikenali. Pastikan Anda sudah login.");
      if (!name.trim()) throw new Error("Nama portofolio wajib diisi.");

      setSaving(true);

      const fd = new FormData();
      fd.append("mua_id", muaId);
      fd.append("name", name.trim());
      if (makeupType.trim()) fd.append("makeup_type", makeupType.trim());
      if (collab.trim()) fd.append("collaboration", collab.trim());

      // compress & append
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
          "X-Req-Id": reqId,
        },
        body: fd as any,
      });

      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch {}

      if (!res.ok) {
        // if HTML returned, include snippet
        const snippet = (!json && text) ? text.slice(0, 300).replace(/\s+/g, " ") : undefined;
        const msg = json?.message || json?.error || snippet || `Gagal menyimpan (status ${res.status})`;
        if (res.status === 401) {
          // force logout
          await SecureStore.deleteItemAsync("auth").catch(() => {});
          Alert.alert("Sesi berakhir", "Silakan login ulang.", [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]);
          return;
        }
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

  if (booting) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
        <Text style={{ color: MUTED, marginTop: 8 }}>Memverifikasi akun…</Text>
      </View>
    );
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
