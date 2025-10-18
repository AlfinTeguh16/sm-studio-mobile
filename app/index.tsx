// app/index.tsx
import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Platform, Text } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

/** ====== Konstanta API ====== */
const API_ORIGIN = "https://smstudio.my.id";
const API_BASE = `${API_ORIGIN}/api`;
const API_ME = `${API_BASE}/auth/me`; // pastikan endpoint ini benar

type MeResponse = {
  id?: number | string;
  name?: string;
  email?: string;
  profile?: { id?: string; name?: string };
  user?: any;
};

type AuthStored = {
  token?: string;
  user?: any;
  profile?: any;
  [k: string]: any;
};

async function readAuth(): Promise<AuthStored | null> {
  try {
    const raw = await SecureStore.getItemAsync("auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeAuth(obj: AuthStored) {
  try {
    await SecureStore.setItemAsync("auth", JSON.stringify(obj));
  } catch {}
}

async function clearAuth() {
  try {
    await SecureStore.deleteItemAsync("auth");
  } catch {}
}

export default function Index() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    (async () => {
      try {
        // 1) baca token dari secure storage
        const stored = await readAuth();
        const token = stored?.token ? String(stored.token) : null;

        if (!token) {
          // tidak ada token → ke login
          router.replace("/(auth)/login");
          return;
        }

        // 2) validasi token ke /auth/me
        const res = await fetch(API_ME, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          // token invalid / expired
          await clearAuth();
          router.replace("/(auth)/login");
          return;
        }

        // 3) sukses → simpan profil terbaru (opsional)
        let me: MeResponse | null = null;
        try {
          me = await res.json();
        } catch {
          me = null;
        }

        if (me) {
          const next: AuthStored = {
            ...(stored || {}),
            token,
            user: me.user ?? stored?.user,
            profile: me.profile ?? stored?.profile,
            me, // simpan mentah kalau perlu
          };
          await writeAuth(next);
        }

        // 4) arahkan ke tabs user
        router.replace("/(user)/(tabs)");
      } catch (e) {
        // jaringan/exception lain → ke login
        router.replace("/(auth)/login");
      } finally {
        setBooting(false);
      }
    })();
  }, [router]);

  // Splash/loading ringkas biar transisi halus
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: Platform.select({ ios: 24, android: 0 }),
      }}
    >
      <ActivityIndicator />
      <Text style={{ marginTop: 8, color: "#6B7280" }}>
        {booting ? "Memeriksa sesi..." : "Mengalihkan..."}
      </Text>
    </View>
  );
}
