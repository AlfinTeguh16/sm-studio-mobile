// app/(auth)/login.tsx
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

// 🔥 Perbaikan: hapus trailing space!
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

    setLoading(true);

    try {
      const res = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      if (!res.ok) {
        const { json, text } = await safeParseResponse(res);
        const serverMsg = json?.error || json?.message || text || `HTTP ${res.status}`;
        console.log("[LOGIN] failed response:", res.status, serverMsg);
        throw new Error(serverMsg);
      }

      const data = await res.json().catch(() => null);
      if (!data) throw new Error("Respons server tidak valid.");

      const token = data.token;
      const profile = data.profile || (data.user?.profile ?? null);
      const user = data.user || null;

      if (!token) {
        console.log("[LOGIN] respons tanpa token:", data);
        throw new Error("Token tidak ditemukan dalam respons.");
      }

      // Simpan ke storage
      await setAuthToken(token);
      await setUserProfile(profile ?? user ?? null);

      // Opsional: delay kecil untuk memastikan penyimpanan selesai
      await new Promise((resolve) => setTimeout(resolve, 40));

      // Tentukan rute berdasarkan role
      const role = String(profile?.role ?? user?.profile?.role ?? "").toLowerCase().trim();
      if (role.includes("mua")) {
        router.replace("/(mua)/");
      } else if (role.includes("customer")) {
        router.replace("/(user)/");
      } else {
        router.replace("/");
      }
    } catch (err: any) {
      const message = err?.message || "Terjadi kesalahan saat login.";
      Alert.alert("Login Gagal", message);
      console.warn("[LOGIN] error:", err);
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Masuk</Text>

          <TextField
            label="Email"
            value={email}
            // autoCapitalize="none"
            // keyboardType="email-address"
            onChangeText={(text) => setEmail(text.trim())}
          />

          <View style={styles.passwordWrapper}>
            <Text style={styles.label}>Password</Text>
            <PasswordField value={password} onChangeText={setPassword} />
          </View>

          <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={openSheet} disabled={loading}>
            <Text style={styles.secondaryText}>Daftar</Text>
          </TouchableOpacity>
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
          >
            <Text style={styles.roleText}>Daftar sebagai Pengguna</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roleBtnOutline}
            onPress={() => {
              closeSheet();
              router.push("/(auth)/register?as=mua");
            }}
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
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12,
  },
  label: {
    fontWeight: "700",
    marginBottom: 5,
  },
  passwordWrapper: {
    marginBottom: 15,
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
    color: "#111",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#AA60C8",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
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
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 10,
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
  },
  roleText: {
    color: "#fff",
    fontWeight: "700",
  },
  roleBtnOutline: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#AA60C8",
    marginTop: 6,
  },
  roleTextOutline: {
    color: "#AA60C8",
    fontWeight: "700",
  },
});