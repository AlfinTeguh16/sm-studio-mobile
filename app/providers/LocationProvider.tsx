// app/providers/LocationProvider.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";

type Coords = { lat: number; lng: number } | null;
type LocationState = {
  coords: Coords;
  loading: boolean;
  error?: string | null;
  refresh: () => Promise<void>;
};

const LocationContext = createContext<LocationState | undefined>(undefined);

/** timeout helper */
async function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

/** safe get position (returns null if anything fails) */
async function fetchPositionSafe(): Promise<Coords> {
  try {
    const services = await Location.hasServicesEnabledAsync();
    if (!services) throw new Error("services_disabled");

    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") throw new Error("permission_denied");

    // prefer last known first (faster) then current
    const last = await Location.getLastKnownPositionAsync();
    if (last?.coords) {
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }

    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      10000
    );
    if (pos?.coords) return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    return null;
  } catch (err: any) {
    // normalize error messages
    if (err?.message === "permission_denied") return null;
    return null;
  }
}

export default function LocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<Coords>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const got = await fetchPositionSafe();
      setCoords(got);
    } catch (e: any) {
      setError(String(e?.message ?? e ?? "unknown"));
      setCoords(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // try to get location once on mount
    refresh();
    // no subscription by default — keep it simple and explicit (call refresh when needed)
  }, [refresh]);

  const value = useMemo(
    () => ({ coords, loading, error, refresh }),
    [coords, loading, error, refresh]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/** Named hook consumers will import */
export function useUserLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useUserLocation must be used within a LocationProvider");
  }
  return ctx;
}
