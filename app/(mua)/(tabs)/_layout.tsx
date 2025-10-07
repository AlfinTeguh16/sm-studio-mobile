import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PURPLE = "#AA60C8";

export default function MuaTabsLayout() {
  return (
     <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={["top", "bottom"]}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PURPLE,
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarStyle: {
          height: Platform.select({ ios: 74, android: 64 }),
          paddingTop: Platform.select({ ios: 6, android: 4 }),
          paddingBottom: Platform.select({ ios: 12, android: 10 }),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings/index"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="offerings/index"
        options={{
          title: "Offerings",
          tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
    </SafeAreaView>
  );
}
