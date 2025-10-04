// // app/(user)/_layout.tsx
// import { Stack } from "expo-router";

// export default function UserRootLayout() {
//   return (
//     <Stack screenOptions={{ headerShown: false }}>
//       {/* Tab bar utama */}
//       <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

//       {/* Halaman non-tab (push/replace di atas Tabs) */}
//       <Stack.Screen name="offerings/[id]" options={{ headerShown: false }} />
//       <Stack.Screen name="bookings/new"   options={{ headerShown: false }} />
//       <Stack.Screen name="bookings/[id]"  options={{ headerShown: false }} />
//       <Stack.Screen name="profile"        options={{ headerShown: false }} />
//       <Stack.Screen name="notifications"  options={{ headerShown: false }} />
//       <Stack.Screen name="settings/index" options={{ headerShown: false }} />
//     </Stack>
//   );
// }
import { Stack } from "expo-router";

export default function UserLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* (tabs) akan jadi root di stack ini */}
    </Stack>
  );
}