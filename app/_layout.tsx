// app/_layout.tsx
import { Stack, SplashScreen, useRouter, useSegments } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useFonts, Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SafeAreaView } from "react-native-safe-area-context";
import LocationProvider from "app/providers/LocationProvider";

// ==== PILIH SALAH SATU import sesuai lokasi utils/authStorage.ts ====
// Jika utils ada di "app/utils/authStorage"
import { getAuthToken, getUserProfile } from "app/utils/authStorage";
// Jika utils ada di project root "utils/authStorage", pakai ini:
// import { getAuthToken, getUserProfile } from "../utils/authStorage";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [fontsLoaded] = useFonts({
    Inter: Inter_400Regular,
    "Inter-SemiBold": Inter_600SemiBold,
  });

  // agar tidak spam redirect
  const [bootChecked, setBootChecked] = useState(false);

  // Sembunyikan splash saat layout siap & font loaded
  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Redirect logika: baca token + role, lalu replace ke group yang tepat
  useEffect(() => {
    if (!fontsLoaded || bootChecked) return;

    let mounted = true;
    (async () => {
      try {
        const token = await getAuthToken();
        const profile = await getUserProfile();
        const role = String(profile?.role ?? "").toLowerCase().trim();

        const currentGroup = Array.isArray(segments) && segments.length > 0 ? String(segments[0]) : "";

        // Jika belum login: biarkan user tetap di stack default (auth flow akan handle sendiri).
        // Optional: paksa ke login jika sedang berada di group protected.
        if (!token) {
          if (currentGroup !== "(auth)") {
            // Uncomment kalau ingin selalu paksa ke login:
            // router.replace("/(auth)/login");
          }
          return;
        }

        const isAdmin = role.includes("admin");
        const isMua = role.includes("mua") || role.includes("makeup");

        if (isAdmin) {
          if (currentGroup !== "(admin)") router.replace("/(admin)/");
        } else if (isMua) {
          if (currentGroup !== "(mua)") router.replace("/(mua)/");
        } else {
          // customer/user biasa
          // Jika sekarang nyasar ke group lain, arahkan ke root user
          if (currentGroup === "(mua)" || currentGroup === "(admin)" || currentGroup === "(auth)") {
            router.replace("/");
          }
        }
      } catch (e) {
        console.warn("[_layout auth boot] error:", e);
      } finally {
        if (mounted) setBootChecked(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [fontsLoaded, bootChecked, segments, router]);

  // Saat font belum loaded, jangan render apa-apa (Splash masih tampil)
  if (!fontsLoaded) return null;

  // Opsi: tampilkan indikator tipis sampai bootChecked agar transisi halus (tidak wajib)
  // if (!bootChecked) {
  //   return (
  //     <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
  //       <ActivityIndicator />
  //     </View>
  //   );
  // }

  return (
    <LocationProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
        <View style={{ flex: 1 }} onLayout={onLayout}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </SafeAreaView>
    </LocationProvider>
  );
}
