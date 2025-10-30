import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  Easing,
  Pressable,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import TextField from "../../components/TextField";
import { setAuthToken, setUserProfile } from "../../utils/authStorage";

const LOGIN_URL = "https://smstudio.my.id/api/auth/login";

// --- Password Field Component ---
interface PasswordFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}

const PasswordField = ({ value, onChangeText, placeholder = "Password" }: PasswordFieldProps) => {
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.pwContainer}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        style={styles.textInput}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        returnKeyType="done"
      />
      <TouchableOpacity
        onPress={() => setHidden((prev) => !prev)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={hidden ? "Tampilkan password" : "Sembunyikan password"}
      >
        <Ionicons name={hidden ? "eye-off" : "eye"} size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );
};

// --- Helper: Parse response safely ---
async function safeParseResponse(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

// --- Main Component ---
export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Bottom sheet animation
  const [sheetVisible, setSheetVisible] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    setSheetVisible(true);
    requestAnimationFrame(() => {
      Animated.timing(slide, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [slide]);

  const closeSheet = useCallback(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSheetVisible(false);
    });
  }, [slide]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });

  const onSubmit = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      Alert.alert("Email kosong", "Masukkan email");
      return;
    }
    if (!trimmedPassword) {
      Alert.alert("Password kosong", "Masukkan password");
      return;
    }

    // Validasi format email sederhana
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert("Format email salah", "Masukkan email yang valid");
      return;
    }

    setLoading(true);

    try {
      console.log("[LOGIN] Attempting login for:", trimmedEmail);
      
      const res = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ 
          email: trimmedEmail, 
          password: trimmedPassword 
        }),
      });

      const { json, text } = await safeParseResponse(res);

      if (!res.ok) {
        const serverMsg = json?.error || json?.message || text || `HTTP ${res.status}`;
        console.log("[LOGIN] Failed response:", res.status, serverMsg);
        
        // Handle khusus 401 - unauthorized
        if (res.status === 401) {
          throw new Error("Email atau password salah");
        }
        
        // Handle server errors
        if (res.status >= 500) {
          throw new Error("Server sedang mengalami masalah. Silakan coba lagi.");
        }
        
        throw new Error(serverMsg);
      }

      if (!json) throw new Error("Respons server tidak valid.");

      const token = json.token || json.access_token;
      const profile = json.profile || json.user?.profile || json.user || null;

      if (!token) {
        console.log("[LOGIN] Response without token:", json);
        throw new Error("Token tidak ditemukan dalam respons.");
      }

      console.log("[LOGIN] Login successful, saving credentials...");

      // Simpan ke storage - sequential untuk menghindari race condition
      await setAuthToken(token);
      console.log("[LOGIN] Token saved");
      
      await setUserProfile(profile);
      console.log("[LOGIN] Profile saved");

      // Delay lebih lama untuk memastikan penyimpanan selesai dan state terupdate
      console.log("[LOGIN] Waiting for storage to complete...");
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Tentukan rute berdasarkan role
      const role = String(profile?.role || "").toLowerCase().trim();
      console.log("[LOGIN] User role:", role, "Navigating...");
      
      // Gunakan setTimeout untuk memastikan navigasi terjadi setelah state update
      if (role.includes("mua")) {
        console.log("[LOGIN] Redirecting to MUA dashboard");
        setTimeout(() => {
          router.replace("/(mua)");
        }, 100);
      } else {
        console.log("[LOGIN] Redirecting to User dashboard");
        setTimeout(() => {
          router.replace("/(user)");
        }, 100);
      }

    } catch (err: any) {
      console.error("[LOGIN] Error details:", err);
      
      let errorMessage = "Terjadi kesalahan saat login.";
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.name === 'TypeError' && err.message.includes('Network request failed')) {
        errorMessage = "Koneksi internet bermasalah. Periksa koneksi Anda.";
      } else if (err.name === 'TimeoutError') {
        errorMessage = "Waktu koneksi habis. Silakan coba lagi.";
      }
      
      Alert.alert("Login Gagal", errorMessage);
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  // Handle keyboard submit
  const handleEmailSubmit = () => {
    // Focus ke password field (jika ada ref) atau langsung submit
    onSubmit();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Masuk</Text>
          <Text style={styles.subtitle}>Silakan masuk ke akun Anda</Text>

          <View style={styles.formContainer}>
            <TextField
              label="Email"
              value={email}
              // autoCapitalize="none"
              // keyboardType="email-address"
              onChangeText={setEmail}
              // placeholder="email@contoh.com"
              // returnKeyType="next"
              // onSubmitEditing={handleEmailSubmit}
              // editable={!loading}
            />

            <View style={styles.passwordWrapper}>
              <Text style={styles.label}>Password</Text>
              <PasswordField 
                value={password} 
                onChangeText={setPassword}
                placeholder="Masukkan password"
              />
            </View>

            <TouchableOpacity 
              style={[
                styles.button, 
                loading && styles.buttonDisabled
              ]} 
              onPress={onSubmit} 
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.secondaryButton} 
              onPress={openSheet} 
              disabled={loading}
            >
              <Text style={styles.secondaryText}>Belum punya akun? Daftar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Bottom Sheet Modal */}
      <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Daftar akun</Text>
          <Text style={styles.sheetSubtitle}>Pilih tipe akun untuk registrasi</Text>

          <TouchableOpacity
            style={[styles.roleBtn, { backgroundColor: "#AA60C8" }]}
            onPress={() => {
              closeSheet();
              router.push("/(auth)/register?as=pengguna");
            }}
            disabled={loading}
          >
            <Text style={styles.roleText}>Daftar sebagai Pengguna</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roleBtnOutline}
            onPress={() => {
              closeSheet();
              router.push("/(auth)/register?as=mua");
            }}
            disabled={loading}
          >
            <Text style={styles.roleTextOutline}>Daftar sebagai MUA</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  formContainer: {
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
  },
  label: {
    fontWeight: "600",
    marginBottom: 8,
    color: "#374151",
    fontSize: 14,
  },
  passwordWrapper: {
    marginBottom: 8,
  },
  pwContainer: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  textInput: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    paddingVertical: 8,
  },
  button: {
    marginTop: 8,
    backgroundColor: "#AA60C8",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 14,
  },

  // Bottom Sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E5E7EB",
    marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    color: "#111827",
  },
  sheetSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 6,
  },
  roleBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  roleText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  roleBtnOutline: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#AA60C8",
    marginTop: 6,
    backgroundColor: "#fff",
  },
  roleTextOutline: {
    color: "#AA60C8",
    fontWeight: "700",
    fontSize: 16,
  },
});