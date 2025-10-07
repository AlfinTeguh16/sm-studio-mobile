import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
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
  };
};

const API_BASE = "https://smstudio.my.id/api";
const API_ME = `${API_BASE}/auth/me`;
const API_PROFILE = `${API_BASE}/auth/profile`;
const API_LOGOUT = `${API_BASE}/auth/logout`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

// 🔧 kompat layer untuk expo-image-picker (baru & lama)
const PickerMediaType: any =
  (ImagePicker as any).MediaType ?? (ImagePicker as any).MediaTypeOptions;

export default function SettingsScreen() {
  const router = useRouter();

  // auth
  const [token, setToken] = useState<string | null>(null);

  // form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");

  // foto dari server (untuk preview saat belum memilih baru)
  const [serverPhotoUrl, setServerPhotoUrl] = useState<string>("");

  // foto yang dipilih user (belum diupload)
  const [photoAsset, setPhotoAsset] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // helper mime
  function guessMimeFromUri(uri: string) {
    const lower = uri.split("?")[0].toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".heic")) return "image/heic";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  // headers helper
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  // STEP 1: load token sekali
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // STEP 2: fetch /auth/me ketika token ada
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch(API_ME, {
          headers: authHeaders,
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Gagal memuat profil");
        const me: Me = await res.json();

        if (!mounted.current) return;

        const nm = me?.profile?.name || me?.name || "";
        setName(nm);
        setPhone(me?.profile?.phone || "");
        setAddress(me?.profile?.address || "");
        setBio(me?.profile?.bio || "");

        // normalisasi url: kalau "null"/"undefined" → kosong
        const url = me?.profile?.photo_url ?? "";
        setServerPhotoUrl(url && url !== "null" && url !== "undefined" ? url : "");
      } catch {
        // optionally toast
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [token, authHeaders]);

  // pilih foto (pakai shim MediaType)
  async function onPickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Izin dibutuhkan", "Berikan izin akses galeri untuk memilih foto.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: PickerMediaType.Images, // ← kompat untuk versi baru & lama
        allowsEditing: true,
        quality: 0.85,
      });
      if (res.canceled) return;

      const a = res.assets?.[0];
      if (!a?.uri) return;

      const filename =
        (a as any).fileName ||
        a.uri.split("/").pop() ||
        `photo_${Date.now()}.${(a as any).mimeType?.split?.("/")?.[1] ?? "jpg"}`;

      const type = (a as any).mimeType || guessMimeFromUri(a.uri);

      setPhotoAsset({
        uri: a.uri,
        name: filename,
        type,
      });
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa membuka galeri");
    }
  }

  async function onSave() {
    try {
      setSaving(true);

      if (photoAsset) {
        const fd = new FormData();
        fd.append("_method", "PATCH");
        if (name) fd.append("name", name);
        if (phone) fd.append("phone", phone);
        if (address) fd.append("address", address);
        if (bio) fd.append("bio", bio);
      
        const fileUri = photoAsset.uri;
        const fileType = photoAsset.type || "application/octet-stream";
        const fileName = photoAsset.name || `photo_${Date.now()}.jpg`;
      
        let filePart: any;
      
        try {
          // Kirim sebagai Blob supaya Laravel 100% mengenali sebagai file
          const resp = await fetch(fileUri);
          let blob: Blob = await resp.blob();
      
          // pastikan MIME ada (beberapa URI iOS kosong)
          if (!("type" in blob) || !blob.type || blob.type === "") {
            // set ulang type via slice
            // @ts-ignore slice type overload
            blob = blob.slice(0, blob.size, fileType);
          }
      
          filePart = blob; // gunakan overload (name, blob, filename)
          fd.append("photo_url", filePart, fileName);
        } catch {
          // fallback RN style (beberapa Android cukup dengan objek ini)
          fd.append("photo_url", { uri: fileUri, name: fileName, type: fileType } as any);
        }
      
        const res = await fetch(API_PROFILE, {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: fd,
        });
      
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) throw new Error(json?.message || "Gagal menyimpan profil");
      
        if (json?.profile?.photo_url) {
          setServerPhotoUrl(json.profile.photo_url);
          setPhotoAsset(null);
        }
      } else {
        // PATCH JSON biasa
        const res = await fetch(API_PROFILE, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(authHeaders || {}),
          },
          body: JSON.stringify({
            name: name || undefined,
            phone: phone || undefined,
            address: address || undefined,
            bio: bio || undefined,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || "Gagal menyimpan profil");
      }

      // update cache auth (nama)
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.user) auth.user.name = name;
          if (auth?.profile) auth.profile.name = name;
          await SecureStore.setItemAsync("auth", JSON.stringify(auth));
        }
      } catch {}

      Alert.alert("Sukses", "Profil berhasil diperbarui");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan profil");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    try {
      setLoggingOut(true);
      await fetch(`${API_LOGOUT}?all=true`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(authHeaders || {}),
        },
      }).catch(() => {});
      await SecureStore.deleteItemAsync("auth");
      Alert.alert("Keluar", "Anda telah keluar.", [
        { text: "OK", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch {
      await SecureStore.deleteItemAsync("auth");
      router.replace("/(auth)/login");
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
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholder="Nama"
        placeholderTextColor={MUTED}
      />

      <Text style={styles.label}>No. HP</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        style={styles.input}
        keyboardType="phone-pad"
        placeholder="0812xxxxxxx"
        placeholderTextColor={MUTED}
      />

      <Text style={styles.label}>Alamat</Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        style={styles.input}
        placeholder="Alamat"
        placeholderTextColor={MUTED}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        style={[styles.input, { height: 100, textAlignVertical: "top" }]}
        placeholder="Tentang Anda"
        placeholderTextColor={MUTED}
        multiline
      />

      {/* Upload Foto */}
      <Text style={styles.label}>Foto Profil</Text>

      {photoAsset ? (
        <View style={{ marginHorizontal: 20, alignItems: "flex-start" }}>
          <Image
            source={{ uri: photoAsset.uri }}
            style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 8, backgroundColor: "#f3f4f6" }}
          />
          <Text style={{ color: MUTED, marginBottom: 8 }} numberOfLines={1}>
            {photoAsset.name}
          </Text>
        </View>
      ) : serverPhotoUrl ? (
        <View style={{ marginHorizontal: 20, alignItems: "flex-start" }}>
          <Image
            source={{ uri: serverPhotoUrl }}
            style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 8, backgroundColor: "#f3f4f6" }}
          />
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

      <TouchableOpacity
        style={[styles.outBtn, loggingOut && { opacity: 0.7 }]}
        onPress={onLogout}
        disabled={loggingOut}
      >
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
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    color: "#111",
    backgroundColor: "#fff",
  },
  primaryBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 50,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  outBtn: {
    marginHorizontal: 20,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  outText: { color: "#b91c1c", fontWeight: "800" },
  secondaryBtn: {
    marginHorizontal: 20,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryText: { color: PURPLE, fontWeight: "700" },
});
