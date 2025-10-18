import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, Platform, Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";

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
    location_lat?: number | null;
    location_lng?: number | null;
  };
};

const API_BASE = "https://smstudio.my.id/api";
const ABS_BASE = "https://smstudio.my.id"; // untuk jadikan URL absolut
const API_ME = `${API_BASE}/auth/me`;
const API_PROFILE = `${API_BASE}/auth/profile`;
const API_LOGOUT = `${API_BASE}/auth/logout`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

// kompat expo-image-picker (baru/lama)
const PickerMediaType: any =
  (ImagePicker as any).MediaType ?? (ImagePicker as any).MediaTypeOptions;

/* ===== Helpers URL foto ===== */
function toAbsoluteUrl(u?: string | null) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${ABS_BASE}${u}`;
  return `${ABS_BASE}/${u}`;
}
function withBust(u: string) {
  if (!u) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}t=${Date.now()}`;
}

export default function SettingsScreen() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");

  // GPS
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // foto
  const [serverPhotoUrl, setServerPhotoUrl] = useState<string>("");
  const [photoAsset, setPhotoAsset] = useState<{ uri: string; name: string; type: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

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

  // STEP 1: token
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
        }
      } catch {}
    })();
  }, []);

  // STEP 2: load profil
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(API_ME, { headers: authHeaders, signal: ctrl.signal });
        if (!res.ok) throw new Error("Gagal memuat profil");
        const me: Me = await res.json();
        if (!mounted.current) return;

        const prof = me?.profile ?? {};
        setName((prof?.name ?? me?.name ?? "").trim?.() ?? "");
        setPhone(prof?.phone ?? "");
        setAddress(prof?.address ?? "");
        setBio(prof?.bio ?? "");

        // foto absolut + cache bust agar langsung refresh
        const rawUrl = prof?.photo_url ?? "";
        const abs = toAbsoluteUrl(rawUrl);
        setServerPhotoUrl(abs ? withBust(abs) : "");

        // GPS
        setLat(
          typeof prof?.location_lat === "number"
            ? prof.location_lat
            : prof?.location_lat
            ? Number(prof.location_lat)
            : null
        );
        setLng(
          typeof prof?.location_lng === "number"
            ? prof.location_lng
            : prof?.location_lng
            ? Number(prof.location_lng)
            : null
        );
      } catch {
      } finally {
        mounted.current && setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [token, authHeaders]);

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
      if (res.canceled) return;

      const a = res.assets?.[0];
      if (!a?.uri) return;

      const mime = (a as any).mimeType || guessMimeFromUri(a.uri);
      const base = (a as any).fileName || (a.uri.split("/").pop() ?? `photo_${Date.now()}`);
      const name = ensureExtMatches(base, mime);
      const uri = a.uri.startsWith("file://") ? a.uri : `file://${a.uri}`;

      setPhotoAsset({ uri, name, type: mime });
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa membuka galeri");
    }
  }

  // AMBIL LOKASI GPS
  async function onPickLocation() {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin lokasi ditolak", "Aktifkan izin lokasi untuk mengambil koordinat.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa mengambil lokasi.");
    } finally {
      setLocLoading(false);
    }
  }

  // SIMPAN (selalu multipart + _method=PATCH; aman walau tanpa foto)
  async function onSave() {
    try {
      setSaving(true);

      const fd = new FormData();
      fd.append("_method", "PATCH");

      // kirim field termasuk kosong (biar bisa clear)
      fd.append("name", name);
      fd.append("phone", phone);
      fd.append("address", address);
      fd.append("bio", bio);

      // kirim GPS kalau ada nilai; kalau ingin clear, kirim kosong string -> BE ubah ke null
      if (lat !== null && isFinite(Number(lat))) fd.append("location_lat", String(lat));
      if (lng !== null && isFinite(Number(lng))) fd.append("location_lng", String(lng));

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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // penting: JANGAN set Content-Type untuk FormData
        },
        body: fd,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("PROFILE SAVE FAILED", res.status, json);
        const firstErr =
          (json?.errors && (Object.values(json.errors)[0] as any)?.[0]) ||
          json?.message ||
          `HTTP ${res.status}`;
        throw new Error(firstErr);
      }

      // Ambil profile dari berbagai bentuk payload
      const savedProfile =
        json?.profile ??
        json?.data?.profile ??
        json?.data?.user?.profile ??
        null;

      // foto absolut + cache bust
      let newUrl: string =
        savedProfile?.photo_url ||
        json?.photo_url ||
        "";

      if (newUrl) {
        const abs = toAbsoluteUrl(newUrl);
        setServerPhotoUrl(withBust(abs));
        setPhotoAsset(null);
      }

      // sinkron form state dari server (terutama nama)
      if (savedProfile) {
        setName((savedProfile.name ?? name)?.toString?.().trim?.() ?? name);
        setPhone(savedProfile.phone ?? phone);
        setAddress(savedProfile.address ?? address);
        setBio(savedProfile.bio ?? bio);

        setLat(
          typeof savedProfile.location_lat === "number"
            ? savedProfile.location_lat
            : savedProfile.location_lat != null
            ? Number(savedProfile.location_lat)
            : lat
        );
        setLng(
          typeof savedProfile.location_lng === "number"
            ? savedProfile.location_lng
            : savedProfile.location_lng != null
            ? Number(savedProfile.location_lng)
            : lng
        );
      }

      // update cache local
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (!auth.profile) auth.profile = {};
          auth.user = auth.user || {};
          auth.user.name = savedProfile?.name ?? name;
          auth.profile.name = savedProfile?.name ?? name;
          auth.profile.phone = savedProfile?.phone ?? phone;
          auth.profile.address = savedProfile?.address ?? address;
          auth.profile.bio = savedProfile?.bio ?? bio;
          auth.profile.photo_url = savedProfile?.photo_url ?? newUrl ?? auth.profile.photo_url;
          auth.profile.location_lat =
            savedProfile?.location_lat ?? lat;
          auth.profile.location_lng =
            savedProfile?.location_lng ?? lng;
          await SecureStore.setItemAsync("auth", JSON.stringify(auth));
        }
      } catch {}

      Alert.alert("Sukses", "Profil berhasil diperbarui.");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan profil.");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    try {
      setLoggingOut(true);
      await fetch(`${API_LOGOUT}?all=true`, {
        method: "POST",
        headers: { Accept: "application/json", ...(authHeaders || {}) },
      }).catch(() => {});
      await SecureStore.deleteItemAsync("auth");
      Alert.alert("Keluar", "Anda telah keluar.", [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]);
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator />
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

      {/* GPS */}
      <Text style={styles.label}>Lokasi (GPS)</Text>
      <View style={{ marginHorizontal: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={lat != null ? String(lat) : ""}
            onChangeText={(t) => setLat(t.trim() === "" ? null : Number(t))}
            style={[styles.input, { flex: 1 }]}
            placeholder="Latitude"
            placeholderTextColor={MUTED}
            keyboardType="numeric"
          />
          <TextInput
            value={lng != null ? String(lng) : ""}
            onChangeText={(t) => setLng(t.trim() === "" ? null : Number(t))}
            style={[styles.input, { flex: 1 }]}
            placeholder="Longitude"
            placeholderTextColor={MUTED}
            keyboardType="numeric"
          />
        </View>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onPickLocation} disabled={locLoading}>
          {locLoading ? <ActivityIndicator /> : <Ionicons name="navigate-outline" size={18} color={PURPLE} />}
          <Text style={styles.secondaryText}>{locLoading ? "Mengambil..." : "Ambil Lokasi Saya"}</Text>
        </TouchableOpacity>
      </View>

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
