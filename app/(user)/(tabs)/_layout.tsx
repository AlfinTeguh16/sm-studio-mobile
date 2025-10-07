// app/(user)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";


export default function TabsLayout() {
  return (

      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#AA60C8",
          tabBarInactiveTintColor: "#6B7280",
          tabBarStyle: {
            height: Platform.select({ ios: 84, android: 64 }),
            paddingTop: 6,
            paddingBottom: Platform.select({ ios: 24, android: 12 }),
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="bookings/index"
          options={{
            title: "Bookings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="offerings/index"
          options={{
            title: "Offerings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pricetag-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="settings/index"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />

        {/*
       * PENTING: JANGAN menambahkan Tabs.Screen lain untuk detail pages.
       * Kalau terpaksa harus berada di bawah (tabs), sembunyikan dengan:
       * <Tabs.Screen name="some/route" options={{ href: null }} />
       */}
      </Tabs>

  );
}
