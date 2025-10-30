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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import authStorage from "../../utils/authStorage";

// ✅ PERBAIKAN: Definisikan types yang lebih komprehensif
type UserProfile = {
  id?: string;
  name?: string;
  phone?: string | null;
  address?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  role?: string;
};

type Me = UserProfile & {
  profile?: UserProfile;
  user?: UserProfile;
};

const API_BASE = "https://smstudio.my.id/api";
const API_ME = `${API_BASE}/auth/me`;
const API_PROFILE = `${API_BASE}/auth/profile`;
const API_LOGOUT = `${API_BASE}/auth/logout`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

// ✅ PERBAIKAN: Helper function untuk extract profile data dengan aman
function extractProfileData(me: Me | null): UserProfile {
  if (!me) {
    return {};
  }
  
  // Prioritize nested profile/user objects, then fallback to top-level properties
  const profileData = me?.profile || me?.user || me;
  
  return {
    id: profileData?.id,
    name: profileData?.name || "",
    phone: profileData?.phone || "",
    address: profileData?.address || "",
    bio: profileData?.bio || "",
    photo_url: profileData?.photo_url || "",
    role: profileData?.role,
  };
}

export default function SettingsScreen() {
  const router = useRouter();

  // form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Load user profile data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        console.log("[SettingsScreen] Loading user profile...");
        
        // Coba ambil dari cache dulu
        const cachedProfile = await authStorage.getUserProfile();
        if (cachedProfile) {
          console.log("[SettingsScreen] Using cached profile");
          setName(cachedProfile.name || "");
          setPhone(cachedProfile.phone || "");
          setAddress(cachedProfile.address || "");
          setBio(cachedProfile.bio || "");
          setPhotoUrl(cachedProfile.photo_url || "");
        }

        // Ambil data terbaru dari API
        const token = await authStorage.getAuthToken();
        if (!token) {
          console.warn("[SettingsScreen] No token found");
          setLoading(false);
          return;
        }

        const res = await fetch(API_ME, {
          headers: { 
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
          },
        });

        if (res.ok) {
          const me: Me = await res.json();
          console.log("[SettingsScreen] API response:", me);
          
          // ✅ PERBAIKAN: Gunakan helper function untuk extract data dengan aman
          const profileData = extractProfileData(me);
          
          setName(profileData.name || "");
          setPhone(profileData.phone || "");
          setAddress(profileData.address || "");
          setBio(profileData.bio || "");
          setPhotoUrl(profileData.photo_url || "");

          // Update cache dengan data terbaru
          await authStorage.setUserProfile(profileData);
        } else if (res.status === 401) {
          console.log("[SettingsScreen] 401 Unauthorized - Clearing auth");
          await authStorage.clearAuthAll();
          router.replace("/(auth)/login");
        } else {
          console.warn("[SettingsScreen] Failed to fetch profile:", res.status);
        }
      } catch (e: any) {
        console.error("[SettingsScreen] Error loading profile:", e);
        Alert.alert("Error", "Gagal memuat profil: " + (e.message || "Unknown error"));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function onSave() {
    try {
      setSaving(true);
      console.log("[SettingsScreen] Saving profile...");
      
      const token = await authStorage.getAuthToken();
      if (!token) {
        Alert.alert("Error", "Token tidak ditemukan. Silakan login kembali.");
        router.replace("/(auth)/login");
        return;
      }

      const res = await fetch(API_PROFILE, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name || undefined,
          phone: phone || undefined,
          address: address || undefined,
          bio: bio || undefined,
          photo_url: photoUrl || undefined,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = "Gagal menyimpan profil";
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson?.message || errorJson?.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        if (res.status === 401) {
          await authStorage.clearAuthAll();
          router.replace("/(auth)/login");
          return;
        }
        
        throw new Error(errorMessage);
      }

      const json = await res.json();
      console.log("[SettingsScreen] Profile saved successfully:", json);

      // ✅ PERBAIKAN: Update cache dengan data terbaru
      const updatedProfile: UserProfile = {
        name,
        phone,
        address,
        bio,
        photo_url: photoUrl,
        ...extractProfileData(json),
      };
      await authStorage.setUserProfile(updatedProfile);

      Alert.alert("Sukses", "Profil berhasil diperbarui");
    } catch (e: any) {
      console.error("[SettingsScreen] Error saving profile:", e);
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan profil");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    Alert.alert(
      "Konfirmasi Keluar",
      "Apakah Anda yakin ingin keluar dari akun?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Keluar",
          style: "destructive",
          onPress: async () => {
            try {
              setLoggingOut(true);
              console.log("[SettingsScreen] Logging out...");
              
              const token = await authStorage.getAuthToken();
              
              // Call logout API jika token ada
              if (token) {
                try {
                  await fetch(API_LOGOUT, {
                    method: "POST",
                    headers: {
                      Accept: "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                  });
                  console.log("[SettingsScreen] Logout API called successfully");
                } catch (apiError) {
                  console.warn("[SettingsScreen] Logout API call failed:", apiError);
                  // Continue with local logout even if API fails
                }
              }

              // Clear local auth data
              await authStorage.clearAuthAll();
              
              console.log("[SettingsScreen] Logout completed");
              
              Alert.alert("Berhasil Keluar", "Anda telah keluar dari akun.", [
                { 
                  text: "OK", 
                  onPress: () => router.replace("/(auth)/login") 
                },
              ]);
            } catch (error) {
              console.error("[SettingsScreen] Logout error:", error);
              // Fallback: clear local data and redirect
              await authStorage.clearAuthAll();
              router.replace("/(auth)/login");
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={{ marginTop: 12, color: MUTED }}>Memuat profil...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Pengaturan Profil</Text>
      <Text style={styles.caption}>Kelola informasi profil Anda</Text>

      {/* Profile Photo Preview */}
      {photoUrl ? (
        <View style={styles.photoSection}>
          <Image 
            source={{ uri: photoUrl }} 
            style={styles.profilePhoto}
            defaultSource={{ uri: "https://via.placeholder.com/100x100.png?text=Photo" }}
          />
          <Text style={styles.photoLabel}>Foto Profil</Text>
        </View>
      ) : (
        <View style={styles.photoSection}>
          <View style={styles.profilePhotoPlaceholder}>
            <Ionicons name="person" size={32} color={MUTED} />
          </View>
          <Text style={styles.photoLabel}>Belum ada foto profil</Text>
        </View>
      )}

      <Text style={styles.label}>Nama Lengkap</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholder="Masukkan nama lengkap"
        placeholderTextColor={MUTED}
      />

      <Text style={styles.label}>Nomor Telepon</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        style={styles.input}
        keyboardType="phone-pad"
        placeholder="Contoh: 081234567890"
        placeholderTextColor={MUTED}
      />

      <Text style={styles.label}>Alamat</Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        style={styles.input}
        placeholder="Masukkan alamat lengkap"
        placeholderTextColor={MUTED}
      />

      <Text style={styles.label}>Bio / Tentang Saya</Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        style={[styles.input, styles.textArea]}
        placeholder="Ceritakan sedikit tentang diri Anda..."
        placeholderTextColor={MUTED}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>URL Foto Profil</Text>
      <TextInput
        value={photoUrl}
        onChangeText={setPhotoUrl}
        style={styles.input}
        placeholder="https://example.com/photo.jpg"
        placeholderTextColor={MUTED}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity 
        style={[styles.primaryBtn, saving && styles.buttonDisabled]} 
        onPress={onSave} 
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Simpan Perubahan</Text>
        )}
      </TouchableOpacity>

      <View style={styles.spacer} />

      <TouchableOpacity
        style={[styles.outBtn, loggingOut && styles.buttonDisabled]}
        onPress={onLogout}
        disabled={loggingOut}
      >
        {loggingOut ? (
          <ActivityIndicator color="#DC2626" />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            <Text style={styles.outText}>Keluar dari Akun</Text>
          </>
        )}
      </TouchableOpacity>

      {/* App Version Info */}
      <View style={styles.versionSection}>
        <Text style={styles.versionText}>SM Studio App</Text>
        <Text style={styles.versionText}>v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#fff", 
    paddingTop: Platform.select({ ios: 12, android: 8 }) 
  },
  title: { 
    fontSize: 28, 
    fontWeight: "800", 
    marginHorizontal: 20, 
    marginTop: 8, 
    color: "#111827",
    textAlign: "center",
  },
  caption: { 
    marginHorizontal: 20, 
    color: MUTED, 
    marginBottom: 20,
    textAlign: "center",
    fontSize: 14,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  profilePhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f3f4f6",
  },
  profilePhotoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: {
    marginTop: 8,
    color: MUTED,
    fontSize: 14,
  },
  label: { 
    marginHorizontal: 20, 
    marginTop: 16, 
    marginBottom: 8, 
    fontWeight: "600", 
    color: "#111827",
    fontSize: 14,
  },
  input: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    color: "#111827",
    backgroundColor: "#fff",
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
    paddingTop: 12,
    paddingBottom: 12,
  },
  primaryBtn: {
    marginHorizontal: 20,
    marginTop: 24,
    height: 52,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryText: { 
    color: "#fff", 
    fontWeight: "700",
    fontSize: 16,
  },
  outBtn: {
    marginHorizontal: 20,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  outText: { 
    color: "#DC2626", 
    fontWeight: "700",
    fontSize: 16,
  },
  spacer: {
    height: 16,
  },
  versionSection: {
    marginTop: 32,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: "center",
  },
  versionText: {
    color: MUTED,
    fontSize: 12,
    marginBottom: 4,
  },
});