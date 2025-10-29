import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "../../../lib/api";

/** Extract booking id from notification message */

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const TEXT = "#111827";
const CARD_BG = "#F7F2FA";

type Notif = {
  id: string | number;
  user_id: string;
  title: string;
  message: string;
  type: string; // can be 'booking_invite', 'booking', 'system', 'payment', etc.
  is_read: boolean;
  created_at?: string;
};

const fmtTime = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(+d)) return iso;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function extractBookingIdFromMessage(message?: string): string | null {
  if (!message) return null;
  const m1 = message.match(/#\s*(\d+)/);
  if (m1 && m1[1]) return m1[1];
  const m2 = message.match(/INV[-\s]*([0-9]+)/i);
  if (m2 && m2[1]) return m2[1];
  const allNums = message.match(/(\d{2,})/g);
  if (allNums && allNums.length) return allNums[allNums.length - 1];
  return null;
}

export default function NotificationsScreen() {
  const router = useRouter();

  const [items, setItems] = useState<Notif[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // --- safer fetchUnread: handle non-JSON errors (like HTML 404) and fallback to 0 ---
  const fetchUnread = useCallback(async () => {
    try {
      const response = await api.notifications.getUnreadCount();
      // support multiple shapes: { count } or { data: { count } }
      const count = Number(response?.count ?? response?.data?.count ?? 0);
      setUnreadCount(Number.isFinite(count) ? count : 0);
    } catch (err: any) {
      // server returned HTML or 404 — don't crash, fallback to 0 and log
      console.warn("Error fetching unread count:", err);
      setUnreadCount(0);
    }
  }, []);

  // --- safer fetchPage: always return { list, lastPage } even on error ---
  const fetchPage = useCallback(async (p = 1) => {
    try {
      const response = await api.notifications.list({ per_page: 20, page: p });
      const list = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
      const lastPage = Number(response?.last_page ?? (Array.isArray(list) ? (list.length < 20 ? 1 : p) : p)) || p;
      return { list, lastPage };
    } catch (err: any) {
      console.warn(`notifications.list failed (page ${p}):`, err?.message ?? err);
      // return safe defaults so UI continues to work
      return { list: [], lastPage: p };
    }
  }, []);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { list, lastPage } = await fetchPage(1);
        setItems(list);
        setPage(1);
        setHasMore(1 < lastPage);
        await fetchUnread();
      } catch (e: any) {
        Alert.alert("Oops", e?.message || "Gagal memuat notifikasi");
        setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchPage, fetchUnread]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { list, lastPage } = await fetchPage(1);
      setItems(list);
      setPage(1);
      setHasMore(1 < lastPage);
      await fetchUnread();
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage, fetchUnread]);

  const loadMore = useCallback(async () => {
    if (loading || busy || !hasMore) return;
    setBusy(true);
    try {
      const next = page + 1;
      const { list, lastPage } = await fetchPage(next);
      setItems(prev => [...prev, ...list]);
      setPage(next);
      setHasMore(next < lastPage);
    } catch (error) {
      console.error('Error loading more notifications:', error);
    } finally {
      setBusy(false);
    }
  }, [page, fetchPage, hasMore, loading, busy]);

  // actions
  const markRead = useCallback(async (id: string | number, read = true) => {
    try {
      await api.notifications.markAsRead(id);
      setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: read } : n));
      fetchUnread();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // optionally show toast/alert
    }
  }, [fetchUnread]);

  const deleteOne = useCallback(async (id: string | number) => {
    try {
      await api.notifications.delete(id);
      setItems(prev => prev.filter(n => n.id !== id));
      fetchUnread();
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, [fetchUnread]);

  const markAllRead = useCallback(async () => {
    try {
      await api.notifications.markAllAsRead();
      setItems(prev => prev.map(n => ({ ...n, is_read: true })));
      fetchUnread();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, [fetchUnread]);

  const clearRead = useCallback(async () => {
    try {
      await api.notifications.clearRead();
      setItems(prev => prev.filter(n => !n.is_read));
      fetchUnread();
    } catch (error) {
      console.error('Error clearing read notifications:', error);
    }
  }, [fetchUnread]);

  // respond invite
  const respondInvite = useCallback(async (notif: Notif, action: "accept" | "decline") => {
    const bookingId = extractBookingIdFromMessage(notif.message);
    if (!bookingId) {
      Alert.alert("Tidak dapat menanggapi", "Informasi booking tidak ditemukan pada notifikasi. Hubungi admin.");
      return;
    }

    try {
      setItems(prev => prev.map(i => i.id === notif.id ? { ...i, is_read: true } : i));
      await api.bookings.respondToInvite(bookingId, action);
      await markRead(notif.id, true);
      setItems(prev => prev.filter(i => i.id !== notif.id));
      fetchUnread();

      Alert.alert(
        action === "accept" ? "Terkonfirmasi" : "Ditolak",
        action === "accept" ? "Anda telah menerima undangan." : "Anda menolak undangan."
      );
    } catch (e: any) {
      console.warn("respondInvite error:", e);
      Alert.alert("Gagal", e?.message || "Tidak dapat menanggapi undangan.");
      setItems(prev => prev.map(i => i.id === notif.id ? { ...i, is_read: notif.is_read } : i));
    }
  }, [markRead, fetchUnread]);

  // Invite card component
  const InviteCard = useCallback(({ item }: { item: Notif }) => {
    const bookingId = extractBookingIdFromMessage(item.message);
    return (
      <View style={[styles.cardInvite]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[styles.titleInvite]} numberOfLines={2}>{item.title || "Undangan Kolaborasi"}</Text>
          <Text style={{ color: MUTED, fontSize: 12 }}>{fmtTime(item.created_at)}</Text>
        </View>

        <Text style={[styles.msgInvite, { marginTop: 8 }]}>{item.message}</Text>

        {bookingId ? (
          <Text style={[styles.metaInvite]}>Booking: <Text style={{ fontWeight: "800" }}>{bookingId}</Text></Text>
        ) : (
          <Text style={[styles.metaInvite]}>Booking: <Text style={{ fontStyle: "italic" }}>tidak diketahui</Text></Text>
        )}

        <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
          <TouchableOpacity
            style={[styles.btnAccept]}
            onPress={() => {
              Alert.alert(
                "Konfirmasi",
                "Terima undangan ini?",
                [
                  { text: "Batal", style: "cancel" },
                  { text: "Terima", onPress: () => respondInvite(item, "accept") }
                ]
              );
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Terima</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnDecline]}
            onPress={() => {
              Alert.alert(
                "Konfirmasi",
                "Tolak undangan ini?",
                [
                  { text: "Batal", style: "cancel" },
                  { text: "Tolak", onPress: () => respondInvite(item, "decline") }
                ]
              );
            }}
          >
            <Text style={{ color: "#111827", fontWeight: "700" }}>Tolak</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtnSmall]}
            onPress={() => markRead(item.id, !item.is_read)}
          >
            <Ionicons name={item.is_read ? "mail-open-outline" : "mail-unread-outline"} size={18} color="#111" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtnSmall, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}
            onPress={() => deleteOne(item.id)}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [respondInvite, markRead, deleteOne]);

  const renderItem = useCallback(({ item }: { item: Notif }) => {
    const isInvite = item.type === "booking_invite" || /mengundang/i.test(item.message || "");
    const color = item.type === "booking" ? "#0EA5E9" : item.type === "payment" ? "#10B981" : "#A78BFA";
    if (isInvite) {
      return (
        <View style={{ paddingHorizontal: 16 }}>
          <InviteCard item={item} />
        </View>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => router.push({ pathname: "/(mua)/notifications/[id]", params: { id: String(item.id) } })}
        style={[styles.card, !item.is_read && { backgroundColor: "#F8FAFF", borderColor: "#DBEAFE" }]}
        activeOpacity={0.9}
      >
        <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{(item.type || "GEN").toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, !item.is_read && { color: TEXT }]} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.msg} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.time}>{fmtTime(item.created_at)}</Text>
        </View>

        <View style={{ marginLeft: 10, alignItems: "flex-end", gap: 8 }}>
          <TouchableOpacity onPress={() => markRead(item.id, !item.is_read)} style={styles.iconBtn}>
            <Ionicons name={item.is_read ? "mail-open-outline" : "mail-unread-outline"} size={18} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteOne(item.id)} style={[styles.iconBtn, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  }, [InviteCard, markRead, deleteOne, router]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={PURPLE} /><Text style={{ color: MUTED, marginTop: 6 }}>Memuat…</Text></View>;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifikasi</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={markAllRead} style={styles.hBtn}>
            <Ionicons name="checkmark-done-outline" size={16} color="#111" />
            <Text style={styles.hBtnText}>Tandai Baca</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearRead} style={styles.hBtn}>
            <Ionicons name="trash-outline" size={16} color="#111" />
            <Text style={styles.hBtnText}>Bersihkan Dibaca</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.counterRow}>
        <Text style={{ color: MUTED }}>Belum dibaca</Text>
        <View style={styles.counterBadge}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>{unreadCount}</Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={renderItem}
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        ListFooterComponent={busy ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
        ListEmptyComponent={<Text style={{ color: MUTED, padding: 16 }}>Tidak ada notifikasi.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.select({ ios: 8, android: 4 }) },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  header: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontWeight: "800", fontSize: 18, color: TEXT },
  hBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 34, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff" },
  hBtnText: { color: "#111827", fontWeight: "700" },

  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 6 },
  counterBadge: { backgroundColor: PURPLE, paddingHorizontal: 10, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },

  card: { borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center" },
  badgeType: { borderWidth: 1, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, marginRight: 10 },
  title: { fontWeight: "800", color: TEXT },
  msg: { color: MUTED, marginTop: 4 },
  time: { color: MUTED, marginTop: 6, fontSize: 12 },
  iconBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  unreadDot: { position: "absolute", right: 8, top: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: "#EF4444" },

  /* Invite card */
  cardInvite: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
  },
  titleInvite: { fontWeight: "900", fontSize: 15, color: TEXT },
  msgInvite: { color: MUTED },
  metaInvite: { color: MUTED, marginTop: 8, fontSize: 13 },
  btnAccept: {
    backgroundColor: "#10B981",
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDecline: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSmall: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  }
});
