import "expo-router/entry";
/// App.tsx
import React, { useEffect } from "react";
import { Platform } from "react-native";
import {
  useUpdates,
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  UpdateCheckResult,
} from "expo-updates";

// (opsional) komponen root aplikasi kamu
import { Slot } from "expo-router"; // kalau kamu pakai expo-router; atau ganti dengan komponenmu sendiri

export default function App() {
  // Hook ini HANYA memberi state event (isUpdateAvailable, isUpdatePending) & listener
  const { isUpdateAvailable, isUpdatePending } = useUpdates();

  useEffect(() => {
    // Lewatkan di development Web (tidak relevan)
    if (__DEV__ && Platform.OS === "web") return;

    (async () => {
      try {
        // 1) cek ke server EAS Update
        const result: UpdateCheckResult = await checkForUpdateAsync();

        if (result.isAvailable) {
          // 2) unduh update
          await fetchUpdateAsync();
          // 3) terapkan (reload ke bundle baru)
          await reloadAsync();
        }
      } catch (e) {
        // optional: log / silently ignore
        console.warn("[updates] failed:", e);
      }
    })();
  }, []);

  return <Slot />; // atau return <YourRootComponent />
}

