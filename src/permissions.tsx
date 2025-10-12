// src/permissions.ts
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";

// Lokasi (foreground)
export async function ensureLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Izin lokasi ditolak");
  }
  // Kembalikan posisi bila ingin langsung dipakai.
  return await Location.getCurrentPositionAsync({});
}

// Galeri / Foto (Android 13+ & iOS sudah di-handle oleh expo-image-picker)
export async function ensurePhotoPermission() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    throw new Error("Izin galeri/foto ditolak");
  }
  return true;
}
