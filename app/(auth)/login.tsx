import React, { useState, useRef } from "react";
import {
  View, StyleSheet, Text, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Modal, Animated, Easing, Pressable, TextInput
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import TextField from "../../components/TextField"; // pastikan TextField.tsx sudah extend TextInputProps
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const API_URL = "https://smstudio.my.id/api/auth";

/* ---------------- PasswordField (inline component) ---------------- */
function PasswordField({
  value,
  onChangeText,
  placeholder = "Password",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const [hidden, setHidden] = useState(true);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 48,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
      }}
    >
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.toLowerCase())}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        style={{ flex: 1, color: "#111" }}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        returnKeyType="done"
      />
      <TouchableOpacity
        onPress={() => setHidden((s) => !s)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={hidden ? "eye-off" : "eye"} size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );
}

/* ============================== Screen ============================== */
export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // akan diset lowercase oleh PasswordField
  const [loading, setLoading] = useState(false);

  // --- bottom sheet register ---
  const [sheetVisible, setSheetVisible] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const openSheet = () => {
    setSheetVisible(true);
    requestAnimationFrame(() =>
      Animated.timing(slide, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    );
  };
  const closeSheet = () =>
    Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && setSheetVisible(false));
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  const onSubmit = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }), // password sudah lowercase
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || `Login gagal (${res.status})`);
      }

      const { token, user, profile } = await res.json();
      await SecureStore.setItemAsync(
        "auth",
        JSON.stringify({
          token,
          role: profile?.role ?? "customer",
          user,
        })
      );

      const role = (profile?.role || "").toLowerCase();
      if (role === "mua") {
        router.replace("/(mua)");
      } else {
        router.replace("/(user)");
      }
    } catch (e: any) {
      Alert.alert("Login gagal", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <Text style={styles.title}>Masuk</Text>

          {/* Email */}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            // autoCapitalize="none"
            // autoCorrect={false}
            // keyboardType="email-address"
          />

          {/* Password dengan ikon mata + lowercase */}
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontWeight: "700", marginBottom: 5 }}>Password</Text>
            <PasswordField value={password} onChangeText={setPassword} />
          </View>

          <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
            {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Login</Text>}
          </TouchableOpacity>

          {/* tombol register → bottom sheet */}
          <TouchableOpacity style={styles.secondaryButton} onPress={openSheet} disabled={loading}>
            <Text style={styles.secondaryText}>Daftar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* bottom sheet pilih tipe register */}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 20, gap: 6 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  button: { marginTop: 8, backgroundColor: "#AA60C8", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: { paddingVertical: 14, alignItems: "center" },
  secondaryText: { color: "#6B7280", fontWeight: "600" },

  // sheet styles
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.3)" },
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
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#E5E7EB", marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  sheetSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 6 },
  roleBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 4 },
  roleText: { color: "#fff", fontWeight: "700" },
  roleBtnOutline: { paddingVertical: 14, borderRadius: 10, alignItems: "center", borderWidth: 1.5, borderColor: "#AA60C8", marginTop: 6 },
  roleTextOutline: { color: "#AA60C8", fontWeight: "700" },
});
