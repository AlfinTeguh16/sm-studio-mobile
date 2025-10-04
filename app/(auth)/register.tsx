import React, { useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import TextField from "../../components/TextField";

const API = "https://smstudio.my.id/api/auth";

export default function Register() {
  const { as = "pengguna" } = useLocalSearchParams<{ as?: string }>();
  const isMua = as === "mua";
  const router = useRouter();

  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    try {
      setLoading(true);
      const endpoint = isMua ? "register-mua" : "register";
      const res = await fetch(`${API}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `Register gagal (${res.status})`);
      }
      Alert.alert("Sukses", "Akun dibuat. Silakan login."); router.replace("/(auth)/login");
    } catch (e: any) { Alert.alert("Register gagal", e.message); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ padding: 20, gap: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>
          {isMua ? "Daftar sebagai MUA" : "Daftar sebagai Pengguna"}
        </Text>
        <TextField label="Nama" value={name} onChangeText={setName} />
        <TextField label="Email" value={email} onChangeText={setEmail} />
        <TextField label="Password" value={password} onChangeText={setPassword} />
        <TouchableOpacity style={{ backgroundColor: "#AA60C8", padding: 14, borderRadius: 10, alignItems: "center" }} onPress={onRegister} disabled={loading}>
          {loading ? <ActivityIndicator/> : <Text style={{ color: "#fff", fontWeight: "700" }}>Buat Akun</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
