import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";

export default function Layout() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const auth = await SecureStore.getItemAsync("auth");
      if (!auth) router.replace("/(auth)/login");
    })();
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
