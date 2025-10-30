// // app/(user)/_layout.tsx
// import { Stack } from "expo-router";
// import { SafeAreaView } from "react-native-safe-area-context";

// export default function UserLayout() {
//   return (
    
//     <Stack screenOptions={{ headerShown: false }}>
//       {/* Tab group sebagai layar utama */}
//       <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
//       {/* Semua layar non-tab tetap bisa di-push */}
//       <Stack.Screen name="offerings/[id]" />
//       <Stack.Screen name="bookings/new" />
//       <Stack.Screen name="bookings/[id]" />
//       <Stack.Screen name="profile" />
//     </Stack>

//   );
// }

import { Stack } from "expo-router";

export default function UserLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="offerings/[id]" />
      <Stack.Screen name="bookings/new" />
      <Stack.Screen name="bookings/[id]" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="mua/[id]" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}