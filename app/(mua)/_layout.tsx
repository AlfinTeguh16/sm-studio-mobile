import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function MuaLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#AA60C8" }}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({color, size}) => <Ionicons name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: "Jobs", tabBarIcon: ({color, size}) => <Ionicons name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="offerings" options={{ title: "Offerings", tabBarIcon: ({color, size}) => <Ionicons name="pricetags" size={size} color={color} /> }} />
      <Tabs.Screen name="portfolio" options={{ title: "Portfolio", tabBarIcon: ({color, size}) => <Ionicons name="images" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({color, size}) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}