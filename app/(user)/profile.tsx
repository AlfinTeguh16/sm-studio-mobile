import React, { useEffect, useState } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
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
const API_PROFILE = `${API_BASE}/auth/profile`; // PUT/PATCH
const API_LOGOUT = `${API_BASE}/auth/logout`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

export default function SettingsScreen() {
  const router = useRouter();

  // auth
  const [token, setToken] = useState<string | null>(null);

  // form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // load token + me
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
        }
      } catch {}

      try {
        const res = await fetch(API_ME, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const me: Me = await res.json();
          const nm = me?.profile?.name || me?.name || "";
          setName(nm);
          setPhone(me?.profile?.phone || "");
          setAddress(me?.profile?.address || "");
          setBio(me?.profile?.bio || "");
          setPhotoUrl(me?.profile?.photo_url || "");
        }
      } catch (e) {
        // noop
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function onSave() {
    try {
      setSaving(true);
      const res = await fetch(API_PROFILE, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name || undefined,
          phone: phone || undefined,
          address: address || undefined,
          bio: bio || undefined,
          photo_url: photoUrl || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Gagal menyimpan profil");

      // update cache auth di SecureStore kalau nama berubah
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
      // optional call to backend
      await fetch(`${API_LOGOUT}?all=true`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => {});
      // bersihkan sesi lokal
      await SecureStore.deleteItemAsync("auth");
      Alert.alert("Keluar", "Anda telah keluar.", [
        { text: "OK", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch {
      // fallback tetap keluar lokal
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

      <Text style={styles.label}>Photo URL</Text>
      <TextInput
        value={photoUrl}
        onChangeText={setPhotoUrl}
        style={styles.input}
        placeholder="https://..."
        placeholderTextColor={MUTED}
        autoCapitalize="none"
      />

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
});
