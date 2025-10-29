// app/(mua)/portfolio/[id]/edit.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Platform, Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
// optional helper (if exists in your project)
import { getAuthToken } from "../../../../utils/authStorage";

const API = "https://smstudio.my.id/api";
const BASE = API.replace(/\/api$/, "");
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";

type Portfolio = {
  id: number | string;
  mua_id?: string;
  name?: string;
  photos?: string[] | null;
  makeup_type?: string | null;
  collaboration?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LocalImage = { uri: string; name: string; type: string };

function isHttp(s?: string) { return !!s && (/^https?:\/\//i.test(s) || s.startsWith("/storage/")); }
function toFullUrl(u: string) { return u.startsWith("/storage/") ? `${BASE}${u}` : u; }

/** Kompres ringan agar upload bersahabat */
async function compressImage(uri: string): Promise<LocalImage> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: out.uri, name: `photo_${Date.now()}.jpg`, type: "image/jpeg" };
}

/** Helper fetch yang memastikan JSON dan pesan error yang aman */
async function fetchJsonChecked(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  if (!ct.includes("application/json")) {
    const snippet = text ? text.slice(0, 400) : "";
    const e: any = new Error(`Response bukan JSON: ${snippet}`);
    e.status = res.status;
    throw e;
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    const e: any = new Error("Gagal parsing JSON dari server.");
    e.status = res.status;
    throw e;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`;
    const e: any = new Error(msg);
    e.status = res.status;
    throw e;
  }

  return json;
}

export default function PortfolioEdit() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  // auth
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  // loading flags
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [makeupType, setMakeupType] = useState("");
  const [collab, setCollab] = useState("");

  const [serverPhotos, setServerPhotos] = useState<string[]>([]);
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);

  // bootstrap token: try getAuthToken() first then SecureStore
  useEffect(() => {
    (async () => {
      try {
        let t: string | null = null;
        if (typeof getAuthToken === "function") {
          try { t = await getAuthToken(); } catch {}
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
        console.warn("bootstrap token failed:", e);
      } finally {
        setTokenReady(true);
      }
    })();
  }, []);

  // fetch portfolio (wait tokenReady to avoid premature unauthenticated requests)
  useEffect(() => {
    if (!tokenReady) return;
    if (!id) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const url = `${API}/portfolios/${encodeURIComponent(String(id))}`;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        // try with token (if present), fallback without token for public resources
        try {
          const json = await fetchJsonChecked(url, { headers });
          const p: Portfolio = json?.data ?? json;
          setName(p?.name ?? "");
          setMakeupType(p?.makeup_type ?? "");
          setCollab(p?.collaboration ?? "");
          setServerPhotos(Array.isArray(p?.photos) ? p.photos.filter(Boolean) as string[] : []);
        } catch (e: any) {
          if (e?.status === 401) {
            // session expired — clear auth, force login
            await SecureStore.deleteItemAsync("auth").catch(()=>{});
            Alert.alert("Sesi Berakhir", "Silakan login kembali.", [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]);
            return;
          }
          // fallback: try unauthenticated GET (in case resource is public)
          try {
            const json = await fetchJsonChecked(`${API}/portfolios/${encodeURIComponent(String(id))}`, { headers: { Accept: "application/json" } });
            const p: Portfolio = json?.data ?? json;
            setName(p?.name ?? "");
            setMakeupType(p?.makeup_type ?? "");
            setCollab(p?.collaboration ?? "");
            setServerPhotos(Array.isArray(p?.photos) ? p.photos.filter(Boolean) as string[] : []);
          } catch (err) {
            throw err;
          }
        }
      } catch (e: any) {
        console.warn("Failed to load portfolio:", e);
        Alert.alert("Gagal", e?.message || "Tidak bisa memuat portofolio.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token, tokenReady, router]);

  // pick images
  const pickImages = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin diperlukan", "Izinkan akses galeri untuk menambahkan foto.");
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
        const ext = (a.uri.split(".").pop() || "jpg").replace(/\?.*$/, "").toLowerCase();
        const name = a.fileName || `photo_${Date.now()}_${i}.${ext}`;
        const type = a.mimeType || (ext === "png" ? "image/png" : "image/jpeg");
        return { uri: a.uri, name, type };
      });

      setLocalImages(prev => [...prev, ...mapped].slice(0, 50));
    } catch (e: any) {
      console.warn("pickImages error:", e);
      Alert.alert("Gagal", "Tidak dapat memilih gambar.");
    }
  }, []);

  // remove local draft image
  const removeLocalImage = (idx: number) => {
    setLocalImages(prev => prev.filter((_, i) => i !== idx));
  };

  // remove server photo from list (FE only; it will be sent as kept list on save)
  const removeServerPhoto = (idx: number) => {
    setServerPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // SIMPAN: kirim field + (URL foto yang dipertahankan) + file baru sekaligus
  async function saveAll() {
    try {
      if (!id) throw new Error("ID portofolio tidak valid.");
      if (!token) throw new Error("Sesi tidak valid. Silakan login ulang.");
      if (!name.trim()) throw new Error("Nama portofolio wajib diisi.");

      setSaving(true);

      const fd = new FormData();
      (fd as any).append("_method", "PATCH"); // Laravel expects POST+_method
      (fd as any).append("name", name.trim());
      (fd as any).append("makeup_type", makeupType.trim());
      (fd as any).append("collaboration", collab.trim());

      // Kirim URL foto yang mau dipertahankan (server harus mendukung photos[] sebagai array URL)
      serverPhotos.forEach((url) => (fd as any).append("photos[]", String(url)));

      // Kompres setiap file lokal & lampirkan
      for (const f of localImages) {
        const c = await compressImage(f.uri);
        (fd as any).append("photos[]", {
          uri: c.uri,
          name: f.name.endsWith(".jpg") || f.name.endsWith(".jpeg") ? f.name : c.name,
          type: "image/jpeg",
        } as any);
      }

      const res = await fetch(`${API}/portfolios/${encodeURIComponent(String(id))}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          // Jangan set "Content-Type" — fetch akan atur multipart boundary otomatis
        },
        body: fd as any,
      });

      // parse safe
      const text = await res.text();
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const snippet = text ? text.slice(0, 500) : "";
        throw new Error(`Response bukan JSON: ${snippet}`);
      }
      const j = JSON.parse(text);

      if (!res.ok) {
        const msg = j?.message || j?.error || `Gagal menyimpan (status ${res.status})`;
        throw new Error(msg);
      }

      const updated: Portfolio = j?.data ?? j;
      setServerPhotos(Array.isArray(updated?.photos) ? updated.photos.filter(Boolean) as string[] : []);
      setLocalImages([]);
      Alert.alert("Berhasil", "Perubahan disimpan.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      console.warn("saveAll error:", e);
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan perubahan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ color: TEXT_MUTED, marginTop: 6 }}>Memuat…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={18} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Portofolio</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.label}>Nama *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Contoh: Bridal Natural"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>Tipe Make Up (opsional)</Text>
          <TextInput
            value={makeupType}
            onChangeText={setMakeupType}
            placeholder="graduation / party / bridal / sfx"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { marginTop: 10 }]}>Kolaborasi (opsional)</Text>
          <TextInput
            value={collab}
            onChangeText={setCollab}
            placeholder="Nama partner/brand"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          {/* Foto dari server */}
          <Text style={[styles.label, { marginTop: 14 }]}>Foto Saat Ini</Text>
          {serverPhotos.length > 0 ? (
            <View style={{ gap: 10 }}>
              {serverPhotos.map((p, idx) => (
                <View key={`${p}-${idx}`}>
                  <Image
                    source={{ uri: isHttp(p) ? toFullUrl(p) : p }}
                    style={{ width: "100%", height: 180, borderRadius: 10, backgroundColor: "#f3f4f6" }}
                    resizeMode="cover"
                  />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
                    <TouchableOpacity
                      onPress={() => removeServerPhoto(idx)}
                      style={[styles.iconBtn, { backgroundColor: "#fee2e2" }]}
                    >
                      <Ionicons name="trash" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: TEXT_MUTED, marginTop: 6 }}>Tidak ada foto lama.</Text>
          )}

          {/* Tambah foto baru */}
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
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.cta, saving && { opacity: 0.6 }]} disabled={saving} onPress={saveAll}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Simpan Perubahan</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:"#fff" },
  header:{
    paddingHorizontal:16, paddingTop:Platform.select({ ios:14, android:10 }), paddingBottom:8,
    flexDirection:"row", alignItems:"center", justifyContent:"space-between"
  },
  iconBtn:{
    width:40, height:40, borderRadius:10, borderWidth:1, borderColor:BORDER,
    alignItems:"center", justifyContent:"center", backgroundColor:"#fff"
  },
  headerTitle:{ fontSize:18, fontWeight:"800", color:"#111827" },

  card:{
    margin:16, padding:14, borderRadius:14, backgroundColor:"#fff",
    borderWidth:1, borderColor:"#EDE9FE"
  },
  label:{ fontWeight:"800", color:"#111827", marginBottom:6 },
  input:{
    borderWidth:1, borderColor:BORDER, borderRadius:10, paddingHorizontal:12, height:44,
    backgroundColor:"#fff", color:"#111"
  },

  addLineBtn:{
    marginTop:6, alignSelf:"flex-start", flexDirection:"row", alignItems:"center",
    paddingVertical:8, paddingHorizontal:10, borderRadius:10, borderWidth:1, borderColor:BORDER, backgroundColor:"#fff"
  },

  cta:{
    position:"absolute", left:16, right:16, bottom:24, height:50, borderRadius:12,
    backgroundColor:PURPLE, display:"flex",  alignItems:"center", justifyContent:"center"
  },

  thumb:{ position:"relative", width:78, height:78, borderRadius:10, overflow:"hidden", borderWidth:1, borderColor:BORDER },
  thumbRemove:{
    position:"absolute", right:4, top:4, width:18, height:18, borderRadius:9,
    backgroundColor:"#0008", alignItems:"center", justifyContent:"center"
  }
});
