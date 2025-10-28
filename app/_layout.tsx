// app/_layout.tsx
import { Stack, SplashScreen, useRouter, useSegments } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useFonts, Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SafeAreaView } from "react-native-safe-area-context";
import LocationProvider from "app/providers/LocationProvider";
import { getAuthToken, getUserProfile, setUserProfile } from "../utils/authStorage";
import { api } from "../lib/api";

// Cegah splash screen disembunyikan otomatis
SplashScreen.preventAutoHideAsync().catch(() => { });

const FONT_LOAD_TIMEOUT = 3000; // ms
const LOADER_MAX_TIMEOUT = 10000; // ms

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const initialSegmentsRef = useRef<Array<string>>(Array.isArray(segments) ? [...segments] : []);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    "Inter-SemiBold": Inter_600SemiBold,
  });

  const [ready, setReady] = useState(false);
  const didBootRef = useRef(false);
  const splashHiddenRef = useRef(false);
  const forcedReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fungsi idempoten untuk menyembunyikan splash
  const hideSplash = useCallback(async () => {
    if (splashHiddenRef.current) return;
    try {
      await SplashScreen.hideAsync();
      splashHiddenRef.current = true;
      console.log("[SPLASH] hideAsync called.");
    } catch (e) {
      console.warn("[SPLASH] hide error", e);
    }
  }, []);

  // Sembunyikan splash jika font sudah dimuat atau timeout
  useEffect(() => {
    if (splashHiddenRef.current) return;

    const fontTimeout = setTimeout(() => {
      hideSplash();
    }, FONT_LOAD_TIMEOUT);

    if (fontsLoaded) {
      clearTimeout(fontTimeout);
      hideSplash();
    }

    return () => clearTimeout(fontTimeout);
  }, [fontsLoaded, hideSplash]);

  // Boot logic: auth check, routing, dan kesiapan aplikasi
  useEffect(() => {
    if (didBootRef.current) return;
    didBootRef.current = true;

    let mounted = true;

    // Mulai timer safety (maksimal 10 detik)
    forcedReadyTimerRef.current = setTimeout(() => {
      if (mounted && !ready) {
        console.log("[BOOT] forcing ready due to timeout");
        setReady(true);
      }
      if (!splashHiddenRef.current) {
        hideSplash();
      }
    }, LOADER_MAX_TIMEOUT);

    const bootApp = async () => {
      try {
        console.log("[BOOT] start boot check");
        const token = await getAuthToken();
        let profile = await getUserProfile();

        // Jika ada token tapi tidak ada profile, coba ambil dari API
        if (token && !profile) {
          try {
            const userData = await api.me();
            if (userData) {
              await setUserProfile(userData);
              profile = await getUserProfile();
            }
          } catch (error) {
            console.warn("[BOOT] Failed to fetch user data:", error);
            // Jika gagal mengambil data user, hapus token dan arahkan ke login
            await setUserProfile(null);
            return router.replace("/(auth)/login");
          }
        }

        // Log dengan aman
        try {
          const profileStr = profile ? JSON.stringify(profile) : "null";
          console.log(`[BOOT] token: ${!!token} profile: ${profileStr}`);
        } catch {
          console.log(`[BOOT] token: ${!!token} profile: (unserializable)`);
        }

        const role = String(profile?.role ?? "").toLowerCase().trim();
        const currentGroup = initialSegmentsRef.current[0] || "";

        if (!token) {
          console.log("[BOOT] no token — remain in auth flow");
          if (currentGroup !== "(auth)") {
            router.replace("/(auth)/login");
          }
        } else {
          const isMua = role.includes("mua") || role.includes("makeup");
          if (isMua) {
            if (currentGroup !== "(mua)") {
              console.log("[BOOT] redirecting to (mua)");
              router.replace("/(mua)/");
            }
          } else {
            if (["(mua)", "(auth)"].includes(currentGroup)) {
              console.log("[BOOT] redirecting to / (user)");
              router.replace("/");
            }
          }
        }
      } catch (err) {
        console.warn("[_layout auth boot] error:", err);
      } finally {
        // ✅ Pastikan timer dibatalkan karena boot sudah selesai
        if (forcedReadyTimerRef.current) {
          clearTimeout(forcedReadyTimerRef.current);
          forcedReadyTimerRef.current = null;
        }

        if (mounted && !ready) {
          setReady(true);
          console.log("[BOOT] setReady(true) in finally");
        }

        if (!splashHiddenRef.current) {
          hideSplash();
        }
      }
    };

    bootApp();

    return () => {
      mounted = false;
      if (forcedReadyTimerRef.current) {
        clearTimeout(forcedReadyTimerRef.current);
        forcedReadyTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, hideSplash]);

  const showLoader = !ready || !splashHiddenRef.current;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>
        {showLoader ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loaderText}>Memuat aplikasi…</Text>
            <Text style={styles.debugText}>
              Debug: ready={String(ready)}, splashHidden={String(splashHiddenRef.current)}
            </Text>
          </View>
        ) : (
          <LocationProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </LocationProvider>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  inner: { flex: 1 },
  loaderContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  loaderText: { marginTop: 8, color: "#6B7280" },
  debugText: { marginTop: 8, color: "#9CA3AF", fontSize: 12 },
});