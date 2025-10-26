// app/App.tsx
import "expo-router/entry";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import {
  useUpdates,
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  UpdateCheckResult,
} from "expo-updates";
import { Slot } from "expo-router";

// IMPORT MIGRATE — sesuaikan path jika perlu
import { migrateAuthIfNeeded } from "./utils/migrateAuth";

export default function App() {
  // Hook ini HANYA memberi state event (isUpdateAvailable, isUpdatePending) & listener
  const { isUpdateAvailable, isUpdatePending } = useUpdates();

  useEffect(() => {
    // Lewatkan di development Web (tidak relevan)
    if (__DEV__ && Platform.OS === "web") return;

    (async () => {
      try {
        // 0) Jalankan migrasi auth terlebih dahulu (jika ada data lama)
        // migrateAuthIfNeeded menangani kasus "sudah dimigrasi" sendiri
        try {
          await migrateAuthIfNeeded();
          console.log("migrateAuthIfNeeded: done");
        } catch (mErr) {
          console.warn("migrateAuthIfNeeded failed:", mErr);
          // lanjutkan ke update check walau migrasi gagal
        }

        // 1) cek ke server EAS Update
        let result: UpdateCheckResult | null = null;
        try {
          result = await checkForUpdateAsync();
        } catch (checkErr) {
          console.warn("[updates] checkForUpdateAsync failed:", checkErr);
        }

        // jika ada update, fetch + reload
        if (result?.isAvailable) {
          try {
            await fetchUpdateAsync();
            // reload ke bundle baru
            await reloadAsync();
          } catch (fetchErr) {
            console.warn("[updates] failed to fetch/reload:", fetchErr);
          }
        }
      } catch (e) {
        // optional: log / silently ignore
        console.warn("[app startup] unexpected error:", e);
      }
    })();
  }, []);

  return <Slot />;
}
