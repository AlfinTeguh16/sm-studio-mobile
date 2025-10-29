// app/(mua)/notifications/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuthToken } from "../../../utils/authStorage"; // pastikan ada
// jika belum ada, buat helper sederhana (lihat catatan di bawah)

/* ---------------- types ---------------- */
type Notif = {
  id: string | number;
  user_id?: string | number;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
  [k: string]: any;
};

/* ---------------- constants ---------------- */
const API_BASE = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const TEXT = "#111827";
const CARD_BG = "#F7F2FA";

/* ---------------- helpers ---------------- */
const fmtTime = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(+d)) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function extractBookingIdFromMessage(message?: string | null): string | null {
  const m = String(message ?? "");
  // #123
  const mHash = m.match(/#\s*(\d+)/);
  if (mHash && mHash[1]) return mHash[1];
  // INV-123
  const mInv = m.match(/INV[-\s]*([0-9]+)/i);
  if (mInv && mInv[1]) return mInv[1];
  // UUID-ish
  const mUuid = m.match(/([0-9a-fA-F]{8}-[0-9a-fA-F-]{4,36})/);
  if (mUuid && mUuid[1]) return mUuid[1];
  // fallback: largest numeric group
  const allNums = m.match(/(\d{2,})/g);
  if (allNums && allNums.length) return allNums[allNums.length - 1];
  return null;
}

/** safe fetch JSON helper — surfaces non-JSON responses with snippet */
async function fetchJSON(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!ct.includes("application/json")) {
    const preview = (text || "").slice(0, 400).replace(/\s+/g, " ");
    const err: any = new Error(`Expected JSON but got ${res.status} ${res.statusText}: ${preview}`);
    err.status = res.status;
    throw err;
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    const err: any = new Error("Invalid JSON response");
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return json;
}

/* ---------------- component ---------------- */
export default function NotificationsScreen() {
  const router = useRouter();

  const [items, setItems] = useState<Notif[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const unreadEndpoints = [
    `${API_BASE}/notifications/unread-count`,
    `${API_BASE}/notifications/unread_count`,
    `${API_BASE}/notifications/count`,
    `${API_BASE}/notifications/unread`,
  ];

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        setUnreadCount(0);
        return;
      }
      let ok = false;
      for (const url of unreadEndpoints) {
        try {
          const json = await fetchJSON(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const candidate = json?.count ?? json?.data?.count ?? json?.unread ?? json;
          const n = typeof candidate === "number" ? candidate : Number(candidate ?? 0);
          setUnreadCount(Number.isFinite(n) ? n : 0);
          ok = true;
          break;
        } catch (err) {
          // try next
        }
      }
      if (!ok) setUnreadCount(0);
    } catch (e) {
      console.warn("fetchUnreadCount failed:", e);
      setUnreadCount(0);
    }
  }, []);

  const fetchPage = useCallback(async (p = 1) => {
    try {
      const token = await getAuthToken();
      const url = `${API_BASE}/notifications?per_page=20&page=${p}`;
      const json = await fetchJSON(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      const lastPage = Number(json?.last_page ?? 1) || 1;
      return { list: list as Notif[], lastPage };
    } catch (err) {
      console.warn("fetchPage notifications failed:", err);
      return { list: [] as Notif[], lastPage: 1 };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { list, lastPage } = await fetchPage(1);
        if (!alive) return;
        setItems(list);
        setPage(1);
        setHasMore(1 < lastPage);
        await fetchUnreadCount();
      } catch (e: any) {
        Alert.alert("Gagal", e?.message || "Tidak bisa memuat notifikasi");
        setItems([]);
        setHasMore(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchPage, fetchUnreadCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { list, lastPage } = await fetchPage(1);
      setItems(list);
      setPage(1);
      setHasMore(1 < lastPage);
      await fetchUnreadCount();
    } catch (err) {
      console.warn("refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage, fetchUnreadCount]);

  const loadMore = useCallback(async () => {
    if (loading || busy || !hasMore) return;
    setBusy(true);
    try {
      const next = page + 1;
      const { list, lastPage } = await fetchPage(next);
      setItems((prev) => [...prev, ...list]);
      setPage(next);
      setHasMore(next < lastPage);
    } catch (err) {
      console.warn("loadMore failed:", err);
    } finally {
      setBusy(false);
    }
  }, [page, fetchPage, hasMore, loading, busy]);

  const markRead = useCallback(
    async (id: string | number, read = true) => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Butuh login");
        // endpoint backend bervariasi — coba POST /notifications/{id}/mark
        await fetchJSON(`${API_BASE}/notifications/${encodeURIComponent(String(id))}/mark`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ is_read: read }),
        });
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: read } : n)));
        await fetchUnreadCount();
      } catch (err) {
        console.warn("markRead failed:", err);
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: read } : n)));
      }
    },
    [fetchUnreadCount]
  );

  const deleteOne = useCallback(
    async (id: string | number) => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Butuh login");
        await fetchJSON(`${API_BASE}/notifications/${encodeURIComponent(String(id))}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setItems((prev) => prev.filter((n) => n.id !== id));
        await fetchUnreadCount();
      } catch (err) {
        console.warn("deleteOne failed:", err);
        // Alert.alert("Gagal", err?.message || "Tidak bisa menghapus notifikasi.");
      }
    },
    [fetchUnreadCount]
  );

  const markAllRead = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Butuh login");
      await fetchJSON(`${API_BASE}/notifications/mark-all-read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await fetchUnreadCount();
    } catch (err) {
      console.warn("markAllRead failed:", err);
      // Alert.alert("Gagal", err?.message || "Tidak bisa menandai semua sebagai dibaca.");
    }
  }, [fetchUnreadCount]);

  const clearRead = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Butuh login");
      await fetchJSON(`${API_BASE}/notifications/clear-read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      setItems((prev) => prev.filter((n) => !n.is_read));
      await fetchUnreadCount();
    } catch (err) {
      console.warn("clearRead failed:", err);
      // Alert.alert("Gagal", err?.message || "Tidak bisa membersihkan notifikasi dibaca.");
    }
  }, [fetchUnreadCount]);



async function respondInvite(notif: Notif, action: "accept" | "decline") {
  const status = action === "accept" ? "accepted" : "declined";
  const bookingId = extractBookingIdFromMessage(notif.message ?? null);

  if (!bookingId) {
    Alert.alert("Tidak dapat menanggapi", "ID booking tidak ditemukan pada notifikasi. Periksa pesan.");
    return;
  }

  // ambil token & profile untuk diagnosa
  const token = await getAuthToken();
  if (!token) {
    Alert.alert("Butuh login", "Silakan login terlebih dahulu.");
    return;
  }

  try {
    // optional: ambil /auth/me untuk memastikan profile id
    const meRes = await fetch("https://smstudio.my.id/api/auth/me", {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    let meJson: any = null;
    try { meJson = JSON.parse(meText); } catch {}
    const me = (meJson && meJson.data) ? meJson.data : meJson ?? null;
    console.log("[respondInvite] auth/me ->", me);

    // kirim request ke endpoint respond (controller expects 'status')
    const url = `https://smstudio.my.id/api/bookings/${encodeURIComponent(String(bookingId))}/collaborators/respond`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();

    // jika backend kirim HTML atau redirect -> tampilkan snippet
    if (!ct.includes("application/json")) {
      throw new Error(`Unexpected response (not JSON): ${text.slice(0, 400)}`);
    }

    const j = JSON.parse(text);
    if (!res.ok) {
      // tunjukkan pesan yang dikembalikan server (j.message) atau fallback
      throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
    }

    // sukses
    Alert.alert("Sukses", j?.message || "Tanggapan tersimpan.");
    // update UI: hapus notifikasi / tandai dibaca
    // (panggil fungsi markRead / fetchUnreadCount seperti sebelumnya)
  } catch (err: any) {
    console.warn("respondInvite error:", err);
    // Detil error user-friendly
    if (String(err.message || "").toLowerCase().includes("not found") ||
        String(err.message || "").toLowerCase().includes("not invited")) {
      Alert.alert("Gagal", "Undangan tidak ditemukan atau Anda bukan kolaborator untuk booking ini. Periksa bookingId / akun Anda.");
    } else {
      Alert.alert("Gagal", err?.message || String(err));
    }
  }
}


  const InviteCard = useCallback(
    ({ item }: { item: Notif }) => {
      const bookingId = extractBookingIdFromMessage(item.message ?? null);
      return (
        <View style={[styles.cardInvite]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.titleInvite]} numberOfLines={2}>
              {item.title ?? "Undangan Kolaborasi"}
            </Text>
            <Text style={{ color: MUTED, fontSize: 12 }}>{fmtTime(item.created_at ?? null)}</Text>
          </View>

          <Text style={[styles.msgInvite, { marginTop: 8 }]}>{String(item.message ?? "")}</Text>

          {bookingId ? (
            <Text style={[styles.metaInvite]}>
              Booking: <Text style={{ fontWeight: "800" }}>{bookingId}</Text>
            </Text>
          ) : (
            <Text style={[styles.metaInvite]}>
              Booking: <Text style={{ fontStyle: "italic" }}>tidak diketahui</Text>
            </Text>
          )}

          <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
            <TouchableOpacity
              style={[styles.btnAccept]}
              onPress={() =>
                Alert.alert("Konfirmasi", "Terima undangan ini?", [
                  { text: "Batal", style: "cancel" },
                  { text: "Terima", onPress: () => respondInvite(item, "accept") },
                ])
              }
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Terima</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnDecline]}
              onPress={() =>
                Alert.alert("Konfirmasi", "Tolak undangan ini?", [
                  { text: "Batal", style: "cancel" },
                  { text: "Tolak", onPress: () => respondInvite(item, "decline") },
                ])
              }
            >
              <Text style={{ color: "#111827", fontWeight: "700" }}>Tolak</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.iconBtnSmall]} onPress={() => markRead(item.id, !item.is_read)}>
              <Ionicons name={item.is_read ? "mail-open-outline" : "mail-unread-outline"} size={18} color="#111" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.iconBtnSmall, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]} onPress={() => deleteOne(item.id)}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [respondInvite, markRead, deleteOne]
  );

  const renderItem = useCallback(
    ({ item }: { item: Notif }) => {
      const m = String(item.message ?? "");
      const isInvite = item.type === "booking_invite" || /mengundang/i.test(m);
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
          onPress={() => router.push({ pathname: "/(mua)/notifications/[id]", params: { id: String(item.id ?? "") } })}
          style={[styles.card, !item.is_read && { backgroundColor: "#F8FAFF", borderColor: "#DBEAFE" }]}
          activeOpacity={0.9}
        >
          <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
            <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{(item.type ?? "GEN").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, !item.is_read && { color: TEXT }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.msg} numberOfLines={2}>
              {String(item.message ?? "")}
            </Text>
            <Text style={styles.time}>{fmtTime(item.created_at ?? null)}</Text>
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
    },
    [InviteCard, markRead, deleteOne, router]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} />
        <Text style={{ color: MUTED, marginTop: 6 }}>Memuat…</Text>
      </View>
    );
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

      <FlatList<Notif>
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

/* ---------------- styles ---------------- */
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
  },
});
