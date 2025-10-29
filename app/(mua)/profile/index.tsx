// app/(mua)/settings.tsx  (atau path yang sesuai)
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, Platform, Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

// optional helper in your project (if exists). If not present, ignore.
import { getAuthToken } from "../../../utils/authStorage";

type Me = {
  id?: string;
  name?: string;
  profile?: {
    id?: string;
    name?: string;
    phone?: string | null;
    address?: string | null;
    bio?: string | null;
    photo_url?: string | null;
  };
};

const API_BASE = "https://smstudio.my.id/api";
const API_ME = `${API_BASE}/auth/me`;
const API_PROFILE = `${API_BASE}/auth/profile`;
const API_LOGOUT = `${API_BASE}/auth/logout`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

// compatible expo-image-picker shapes
const PickerMediaType: any =
  (ImagePicker as any).MediaType ?? (ImagePicker as any).MediaTypeOptions;

/** Helper: parse JSON safely and throw nice errors; also return parsed object */
async function fetchJsonChecked(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  // If server returned non-JSON (HTML error page), throw snippet
  if (!ct.includes("application/json")) {
    const snippet = text ? text.slice(0, 800) : "";
    const err: any = new Error(`Response bukan JSON: ${snippet}`);
    err.status = res.status;
    throw err;
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    const err: any = new Error("Gagal parse JSON dari server.");
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}

export default function SettingsScreen() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  // form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");

  // foto
  const [serverPhotoUrl, setServerPhotoUrl] = useState<string>("");
  const [photoAsset, setPhotoAsset] = useState<{ uri: string; name: string; type: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // authHeaders memo
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);

  function guessMimeFromUri(uri: string) {
    const lower = uri.split("?")[0].toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".heic")) return "image/heic";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }
  function ensureExtMatches(name: string, mime: string) {
    const hasExt = /\.[a-z0-9]+$/i.test(name);
    if (hasExt) return name;
    const ext =
      mime.includes("png") ? "png" :
      mime.includes("webp") ? "webp" :
      mime.includes("heic") ? "heic" : "jpg";
    return `${name}.${ext}`;
  }

  // STEP 1: bootstrap token (try getAuthToken(), fallback SecureStore)
  useEffect(() => {
    (async () => {
      try {
        let t: string | null = null;
        if (typeof getAuthToken === "function") {
          try { t = await getAuthToken(); } catch (e) { /* ignore */ }
        }
        if (!t) {
          const raw = await SecureStore.getItemAsync("auth");
          if (raw) {
            try {
              const auth = JSON.parse(raw);
              t = auth?.token ?? auth?.accessToken ?? auth?.access_token ?? null;
            } catch {}
          }
        }
        if (t) setToken(String(t));
      } catch (e) {
        console.warn("bootstrap token failed", e);
      } finally {
        setTokenReady(true);
      }
    })();
  }, []);

  // STEP 2: load profile (wait until tokenReady)
  useEffect(() => {
    if (!tokenReady) return;

    // If no token, treat as unauthenticated — show empty form and stop loading
    if (!token) {
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const json = await fetchJsonChecked(API_ME, { headers: { Accept: "application/json", ...(authHeaders || {}) }, signal: ctrl.signal });
        // api may return { data: { ... } } or the object directly
        const payload = json?.data ?? json;
        const me: Me = payload;

        if (!mounted.current) return;

        setName(me?.profile?.name ?? me?.name ?? "");
        setPhone(me?.profile?.phone ?? "");
        setAddress(me?.profile?.address ?? "");
        setBio(me?.profile?.bio ?? "");
        const url = me?.profile?.photo_url ?? "";
        setServerPhotoUrl(url && url !== "null" && url !== "undefined" ? url : "");
      } catch (e: any) {
        // handle unauthorized separately
        if (e?.status === 401) {
          // clear auth and force login
          await SecureStore.deleteItemAsync("auth").catch(() => {});
          Alert.alert("Sesi berakhir", "Silakan login kembali.", [
            { text: "OK", onPress: () => router.replace("/(auth)/login") },
          ]);
          return;
        }
        console.warn("Load profile failed:", e?.message ?? e);
        Alert.alert("Gagal memuat profil", e?.message || "Periksa koneksi atau coba lagi.");
      } finally {
        mounted.current && setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [tokenReady, token, authHeaders, router]);

  // PILIH FOTO
  async function onPickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Izin dibutuhkan", "Berikan izin akses galeri.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: PickerMediaType.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      // new API: res.canceled true => didn't pick. older returns res.uri directly
      if ((res as any).canceled) return;
      const asset = (res as any).assets ? (res as any).assets[0] : (res as any);
      if (!asset?.uri) return;

      const mime = (asset as any).mime || guessMimeFromUri(asset.uri);
      const base = (asset as any).fileName || (asset.uri.split("/").pop() ?? `photo_${Date.now()}`);
      const name = ensureExtMatches(base, mime);
      const uri = asset.uri.startsWith("file://") ? asset.uri : `file://${asset.uri}`;

      setPhotoAsset({ uri, name, type: mime });
    } catch (e: any) {
      console.warn("onPickPhoto error:", e);
      Alert.alert("Gagal", e?.message || "Tidak bisa membuka galeri");
    }
  }

  // SIMPAN (multipart + _method=PATCH)
  async function onSave() {
    try {
      if (!token) {
        Alert.alert("Butuh Login", "Silakan login untuk memperbarui profil.");
        return;
      }

      setSaving(true);

      const fd = new FormData();
      fd.append("_method", "PATCH");
      if (name) fd.append("name", name);
      if (phone) fd.append("phone", phone);
      if (address) fd.append("address", address);
      if (bio) fd.append("bio", bio);

      if (photoAsset) {
        fd.append("photo_url", {
          uri: photoAsset.uri,
          name: photoAsset.name,
          type: photoAsset.type || "image/jpeg",
        } as any);
      }

      const res = await fetch(API_PROFILE, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          // DON'T set Content-Type — let fetch set multipart boundary
        },
        body: fd as any,
      });

      // parse safely
      const text = await res.text();
      const ct = res.headers.get("content-type") || "";
      let json: any = {};
      try { json = ct.includes("application/json") ? JSON.parse(text) : {}; } catch { json = {}; }

      if (!res.ok) {
        // handle 401
        if (res.status === 401) {
          await SecureStore.deleteItemAsync("auth").catch(() => {});
          Alert.alert("Sesi berakhir", "Silakan login kembali.", [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]);
          return;
        }
        const firstErr =
          (json?.errors && (Object.values(json.errors)[0] as any)?.[0]) ||
          json?.message ||
          `HTTP ${res.status}`;
        throw new Error(firstErr);
      }

      // success: update UI & local cache
      const newUrl = json?.profile?.photo_url ?? json?.photo_url;
      if (newUrl) {
        setServerPhotoUrl(newUrl);
        setPhotoAsset(null);
      }

      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.user) auth.user.name = name;
          if (auth?.profile) auth.profile.name = name;
          await SecureStore.setItemAsync("auth", JSON.stringify(auth));
        }
      } catch (e) {
        console.warn("update auth cache failed", e);
      }

      Alert.alert("Sukses", "Profil berhasil diperbarui.");
    } catch (e: any) {
      console.warn("Save profile failed:", e);
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan profil.");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    try {
      setLoggingOut(true);
      try {
        await fetch(`${API_LOGOUT}?all=true`, {
          method: "POST",
          headers: { Accept: "application/json", ...(authHeaders || {}) },
        });
      } catch {}
      await SecureStore.deleteItemAsync("auth").catch(() => {});
      router.replace("/(auth)/login");
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ color: MUTED, marginTop: 8 }}>Memuat profil…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.caption}>Ubah profil Anda atau keluar dari akun.</Text>

      <Text style={styles.label}>Nama</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Nama" placeholderTextColor={MUTED} />

      <Text style={styles.label}>No. HP</Text>
      <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" placeholder="0812xxxxxxx" placeholderTextColor={MUTED} />

      <Text style={styles.label}>Alamat</Text>
      <TextInput value={address} onChangeText={setAddress} style={styles.input} placeholder="Alamat" placeholderTextColor={MUTED} />

      <Text style={styles.label}>Bio</Text>
      <TextInput value={bio} onChangeText={setBio} style={[styles.input, { height: 100, textAlignVertical: "top" }]} placeholder="Tentang Anda" placeholderTextColor={MUTED} multiline />

      <Text style={styles.label}>Foto Profil</Text>

      {photoAsset ? (
        <View style={{ marginHorizontal: 20, alignItems: "flex-start" }}>
          <Image source={{ uri: photoAsset.uri }} style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
          <Text style={{ color: MUTED, marginBottom: 8 }} numberOfLines={1}>{photoAsset.name}</Text>
        </View>
      ) : serverPhotoUrl ? (
        <View style={{ marginHorizontal: 20, alignItems: "flex-start" }}>
          <Image source={{ uri: serverPhotoUrl }} style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 8, backgroundColor: "#f3f4f6" }} />
          <Text style={{ color: MUTED, marginBottom: 8 }}>Foto saat ini</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.secondaryBtn} onPress={onPickPhoto}>
        <Ionicons name="image-outline" size={18} color={PURPLE} />
        <Text style={styles.secondaryText}>{photoAsset ? "Ganti Foto" : "Pilih Foto"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Simpan Perubahan</Text>}
      </TouchableOpacity>

      <View style={{ height: 16 }} />

      <TouchableOpacity style={[styles.outBtn, loggingOut && { opacity: 0.7 }]} onPress={onLogout} disabled={loggingOut}>
        {loggingOut ? (
          <ActivityIndicator />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color="#b91c1c" />
            <Text style={styles.outText}>Logout</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.select({ ios: 12, android: 8 }) },
  title: { fontSize: 28, fontWeight: "800", marginHorizontal: 20, marginTop: 8, color: "#111827" },
  caption: { marginHorizontal: 20, color: MUTED, marginBottom: 12 },
  label: { marginHorizontal: 20, marginTop: 10, marginBottom: 6, fontWeight: "700", color: "#111827" },
  input: {
    marginHorizontal: 20, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12,
    height: 46, color: "#111", backgroundColor: "#fff",
  },
  primaryBtn: {
    marginHorizontal: 20, marginTop: 16, height: 50, borderRadius: 12, backgroundColor: PURPLE,
    alignItems: "center", justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  outBtn: {
    marginHorizontal: 20, height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#fecaca",
    backgroundColor: "#fff5f5", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  outText: { color: "#b91c1c", fontWeight: "800" },
  secondaryBtn: {
    marginHorizontal: 20, height: 44, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  secondaryText: { color: PURPLE, fontWeight: "700" },
});
