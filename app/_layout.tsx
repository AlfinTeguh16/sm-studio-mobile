import { Stack, SplashScreen, useRouter, useSegments } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useFonts, Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SafeAreaView } from "react-native-safe-area-context";
import LocationProvider from "app/providers/LocationProvider";
import { getAuthToken, getUserProfile, setUserProfile, clearAuthAll } from "../utils/authStorage";

SplashScreen.preventAutoHideAsync().catch(() => { });

const FONT_LOAD_TIMEOUT = 3000;
const LOADER_MAX_TIMEOUT = 10000;

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

  const validateTokenWithAPI = async (token: string): Promise<boolean> => {
    try {
      console.log("[BOOT] Validating token with API...");
      
      const response = await fetch('https://smstudio.my.id/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      console.log("[BOOT] Token validation response status:", response.status);
      
      if (response.ok) {
        const userData = await response.json();
        console.log("[BOOT] Token valid, user data received");
        await setUserProfile(userData);
        return true;
      } else if (response.status === 401) {
        console.log("[BOOT] Token invalid (401)");
        return false;
      } else {
        console.warn("[BOOT] Token validation failed with status:", response.status);
        return true; // Tetap lanjut untuk error selain 401
      }
    } catch (error) {
      console.warn("[BOOT] Token validation API call failed:", error);
      return true; // Lanjut dengan cached token jika API error
    }
  };

  useEffect(() => {
    if (didBootRef.current) return;
    didBootRef.current = true;

    let mounted = true;

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

        console.log(`[BOOT] token: ${!!token}, profile:`, profile ? `exists (role: ${profile.role})` : 'null');

        // Jika ada token, validasi dengan API
        if (token) {
          const isTokenValid = await validateTokenWithAPI(token);
          
          if (!isTokenValid) {
            console.log("[BOOT] Token invalid, clearing auth and redirecting to login");
            await clearAuthAll();
            
            if (mounted) {
              setTimeout(() => {
                router.replace("/(auth)/login");
              }, 100);
            }
            return;
          }
          
          // Token valid, ambil profile terbaru
          profile = await getUserProfile();
          console.log("[BOOT] Token valid, profile:", profile);
        }

        const role = String(profile?.role ?? "").toLowerCase().trim();
        const currentGroup = initialSegmentsRef.current[0] || "";

        console.log(`[BOOT] role: ${role}, currentGroup: '${currentGroup}'`);

        if (!token || !profile) {
          console.log("[BOOT] no token or profile — redirect to login");
          if (currentGroup !== "(auth)") {
            setTimeout(() => {
              router.replace("/(auth)/login");
            }, 100);
          }
        } else {
          const isMua = role.includes("mua") || role.includes("makeup");
          console.log(`[BOOT] User is MUA: ${isMua}`);
          
          if (isMua) {
            if (currentGroup !== "(mua)") {
              console.log("[BOOT] redirecting to (mua)");
              setTimeout(() => {
                router.replace("/(mua)");
              }, 100);
            } else {
              console.log("[BOOT] already in (mua), no redirect needed");
            }
          } else {
            // User biasa (customer) - PERBAIKAN DI SINI!
            if (currentGroup === "(mua)" || currentGroup === "(auth)" || currentGroup === "") {
              console.log("[BOOT] redirecting to / (user)");
              setTimeout(() => {
                router.replace("/(user)");
              }, 100);
            } else {
              console.log("[BOOT] already in user section, no redirect needed");
            }
          }
        }
      } catch (err) {
        console.warn("[_layout auth boot] error:", err);
        setTimeout(() => {
          router.replace("/(auth)/login");
        }, 100);
      } finally {
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

    setTimeout(() => {
      bootApp();
    }, 300);

    return () => {
      mounted = false;
      if (forcedReadyTimerRef.current) {
        clearTimeout(forcedReadyTimerRef.current);
        forcedReadyTimerRef.current = null;
      }
    };
  }, [router, hideSplash]);

  const showLoader = !ready || !splashHiddenRef.current;

  if (showLoader) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.inner}>
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#AA60C8" />
            <Text style={styles.loaderText}>Memuat aplikasi…</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>
        <LocationProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(user)" options={{ headerShown: false }} />
            <Stack.Screen name="(mua)" options={{ headerShown: false }} />
            <Stack.Screen name="index" options={{ headerShown: false }} />
          </Stack>
        </LocationProvider>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  inner: { flex: 1 },
  loaderContainer: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  loaderText: { 
    marginTop: 12, 
    color: "#6B7280",
    fontSize: 16
  },
});