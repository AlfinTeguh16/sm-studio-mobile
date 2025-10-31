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
import authStorage from "../../../utils/authStorage";

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
async function getAuthHeaders() {
  try {
    const token = await authStorage.getAuthToken();
    const headers: Record<string, string> = { 
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  } catch (error) {
    console.warn("[getAuthHeaders] Error:", error);
    return { Accept: "application/json" };
  }
}

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
  console.log("[extractBookingId] Analyzing message:", m);
  
  // Debug: Tampilkan semua pattern yang mungkin
  const patterns = [
    { name: "INV-full", pattern: /(INV-[A-Z0-9-]+)/i },
    { name: "INV-code-only", pattern: /INV-(\d{8}-[A-Z0-9]+)/i },
    { name: "date-code-full", pattern: /(\d{8}-[A-Z0-9]+)/ },
    { name: "UUID", pattern: /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/ },
    { name: "hash", pattern: /#\s*(\d+)/ },
    { name: "long-number", pattern: /(\d{6,})/ },
  ];
  
  console.log("[extractBookingId] Pattern analysis:");
  for (const { name, pattern } of patterns) {
    const match = m.match(pattern);
    if (match) {
      console.log(`[extractBookingId] ✓ ${name}:`, match[1] || match[0]);
    }
  }
  
  // Priority 1: Full INV code (INV-20251014-8NZW)
  const fullInvPattern = /(INV-[A-Z0-9-]+)/i;
  const fullInvMatch = m.match(fullInvPattern);
  if (fullInvMatch && fullInvMatch[1]) {
    console.log("[extractBookingId] Using full INV code:", fullInvMatch[1]);
    return fullInvMatch[1];
  }
  
  // Priority 2: INV code without prefix (20251014-8NZW)
  const invCodePattern = /INV-(\d{8}-[A-Z0-9]+)/i;
  const invCodeMatch = m.match(invCodePattern);
  if (invCodeMatch && invCodeMatch[1]) {
    console.log("[extractBookingId] Using INV code without prefix:", invCodeMatch[1]);
    return invCodeMatch[1];
  }
  
  // Priority 3: Date-code pattern (20251014-8NZW)
  const dateCodePattern = /(\d{8}-[A-Z0-9]+)/;
  const dateCodeMatch = m.match(dateCodePattern);
  if (dateCodeMatch && dateCodeMatch[1]) {
    console.log("[extractBookingId] Using date-code:", dateCodeMatch[1]);
    return dateCodeMatch[1];
  }
  
  // Priority 4: UUID pattern
  const uuidPattern = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
  const uuidMatch = m.match(uuidPattern);
  if (uuidMatch && uuidMatch[1]) {
    console.log("[extractBookingId] Using UUID:", uuidMatch[1]);
    return uuidMatch[1];
  }
  
  // Priority 5: Numeric ID dengan #
  const hashPattern = /#\s*(\d+)/;
  const hashMatch = m.match(hashPattern);
  if (hashMatch && hashMatch[1]) {
    console.log("[extractBookingId] Using hash pattern:", hashMatch[1]);
    return hashMatch[1];
  }
  
  // Priority 6: Long numeric ID
  const longNumberPattern = /(\d{6,})/;
  const longNumberMatch = m.match(longNumberPattern);
  if (longNumberMatch && longNumberMatch[1]) {
    console.log("[extractBookingId] Using long number:", longNumberMatch[1]);
    return longNumberMatch[1];
  }
  
  console.warn("[extractBookingId] No valid booking ID found in message:", m);
  return null;
}

/** Safe fetch dengan debug info */
async function fetchJSON(url: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const fullOptions = {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  };

  console.log(`[fetchJSON] ${options.method || 'GET'} ${url}`, {
    headers: fullOptions.headers,
    body: fullOptions.body
  });

  const res = await fetch(url, fullOptions);
  const text = await res.text();

  console.log(`[fetchJSON] Response ${res.status}:`, text.substring(0, 200));

  // Handle unauthorized
  if (res.status === 401) {
    await authStorage.clearAuthAll();
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      errorMsg = json?.message || json?.error || errorMsg;
    } catch {
      errorMsg = text.substring(0, 100) || errorMsg;
    }
    throw new Error(errorMsg);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response");
  }
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

  const fetchUnreadCount = useCallback(async () => {
    try {
      const json = await fetchJSON(`${API_BASE}/notifications/unread-count`);
      const count = json?.count ?? json?.data?.count ?? json?.unread ?? 0;
      setUnreadCount(Number(count) || 0);
    } catch (e: any) {
      console.warn("[fetchUnreadCount] Error:", e);
      // Jika endpoint tidak ada, set ke 0 (bukan error fatal)
      if (e.message.includes("404") || e.message.includes("No query results")) {
        console.log("[fetchUnreadCount] Endpoint not available, setting to 0");
        setUnreadCount(0);
      } else {
        setUnreadCount(0);
      }
    }
  }, []);

  const fetchPage = useCallback(async (p = 1) => {
    const url = `${API_BASE}/notifications?page=${p}`;
    const json = await fetchJSON(url);
    
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const lastPage = Number(json?.last_page ?? json?.meta?.last_page ?? 1) || 1;
    
    return { list: list as Notif[], lastPage };
  }, []);

  // Initial load
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
        if (!alive) return;
        console.error("[NotificationsScreen] Initial load error:", e);
        setItems([]);
        setHasMore(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    
    return () => { alive = false; };
  }, [fetchPage, fetchUnreadCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { list, lastPage } = await fetchPage(1);
      setItems(list);
      setPage(1);
      setHasMore(1 < lastPage);
      await fetchUnreadCount();
    } catch (e: any) {
      console.error("[NotificationsScreen] Refresh error:", e);
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
    } catch (e: any) {
      console.error("[NotificationsScreen] Load more error:", e);
    } finally {
      setBusy(false);
    }
  }, [page, fetchPage, hasMore, loading, busy]);

  const markRead = useCallback(async (id: string | number, read = true) => {
    try {
      await fetchJSON(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        body: JSON.stringify({ is_read: read }),
      });
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: read } : n));
      fetchUnreadCount();
    } catch (e: any) {
      console.warn("[markRead] Error:", e);
    }
  }, [fetchUnreadCount]);

  const deleteOne = useCallback(async (id: string | number) => {
    Alert.alert(
      "Hapus Notifikasi",
      "Apakah Anda yakin ingin menghapus notifikasi ini?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await fetchJSON(`${API_BASE}/notifications/${id}`, { method: "DELETE" });
              setItems((prev) => prev.filter((n) => n.id !== id));
              fetchUnreadCount();
            } catch (e: any) {
              console.warn("[deleteOne] Error:", e);
              Alert.alert("Error", "Gagal menghapus notifikasi");
            }
          },
        },
      ]
    );
  }, [fetchUnreadCount]);

  const markAllRead = useCallback(async () => {
    Alert.alert(
      "Tandai Semua Dibaca",
      "Apakah Anda yakin ingin menandai semua notifikasi sebagai sudah dibaca?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Tandai Semua",
          onPress: async () => {
            try {
              await fetchJSON(`${API_BASE}/notifications/read-all`, { method: "PATCH" });
              setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
              fetchUnreadCount();
              Alert.alert("Berhasil", "Semua notifikasi telah ditandai sebagai dibaca");
            } catch (e: any) {
              console.warn("[markAllRead] Error:", e);
              Alert.alert("Error", "Gagal menandai semua notifikasi");
            }
          },
        },
      ]
    );
  }, [fetchUnreadCount]);

  const clearRead = useCallback(async () => {
    Alert.alert(
      "Bersihkan Notifikasi Dibaca",
      "Apakah Anda yakin ingin menghapus semua notifikasi yang sudah dibaca?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Bersihkan",
          style: "destructive",
          onPress: async () => {
            try {
              await fetchJSON(`${API_BASE}/notifications/clear-read`, { method: "POST" });
              setItems((prev) => prev.filter((n) => !n.is_read));
              fetchUnreadCount();
              Alert.alert("Berhasil", "Notifikasi yang sudah dibaca telah dihapus");
            } catch (e: any) {
              console.warn("[clearRead] Error:", e);
              Alert.alert("Error", "Gagal membersihkan notifikasi");
            }
          },
        },
      ]
    );
  }, [fetchUnreadCount]);


  function extractInvoiceNumberFromMessage(message?: string | null): string | null {
    const m = String(message ?? "");
    console.log("[extractInvoiceNumber] Analyzing message:", m);
    
    // Priority 1: Cari full INV code (INV-20251014-8NZW)
    const fullInvPattern = /(INV-\d{8}-[A-Z0-9]+)/i;
    const fullInvMatch = m.match(fullInvPattern);
    if (fullInvMatch && fullInvMatch[1]) {
      console.log("[extractInvoiceNumber] Found full INV code:", fullInvMatch[1]);
      return fullInvMatch[1];
    }
    
    // Priority 2: Cari invoice number dalam format lain
    const invoicePatterns = [
      /(INV-\d+)/i,
      /(#[A-Z0-9-]+)/i,
      /booking\s+([A-Z0-9-]+)/i
    ];
    
    for (const pattern of invoicePatterns) {
      const match = m.match(pattern);
      if (match && match[1]) {
        console.log("[extractInvoiceNumber] Found invoice pattern:", match[1]);
        return match[1];
      }
    }
    
    console.warn("[extractInvoiceNumber] No invoice number found in message:", m);
    return null;
  }

  // FIXED: respondInvite function dengan multiple ID format attempts
  // FIXED: respondInvite dengan pencarian ID numeric booking
const respondInvite = useCallback(async (notif: Notif, action: "accept" | "decline") => {
  console.log("[respondInvite] Starting with action:", action);
  console.log("[respondInvite] Notification data:", notif);
  
  try {
    // 1. Dapatkan auth data
    const authData = await authStorage.getAuthData();
    
    if (!authData?.token || !authData?.user?.id) {
      Alert.alert("Error", "Token tidak ditemukan. Silakan login ulang.");
      return;
    }

    const status = action === "accept" ? "accepted" : "declined";

    // 2. Extract invoice number dari message
    const invoiceNumber = extractInvoiceNumberFromMessage(notif.message);
    console.log("[respondInvite] Extracted invoice number:", invoiceNumber);

    if (!invoiceNumber) {
      Alert.alert("Error", "Tidak dapat menemukan invoice number dari notifikasi.");
      return;
    }

    // 3. Cari booking ID numeric berdasarkan invoice number
    console.log("[respondInvite] Searching for booking ID by invoice number...");
    let numericBookingId: number | null = null;
    
    try {
      // Dapatkan semua bookings untuk mencari yang sesuai
      const bookingsResponse = await fetchJSON(`${API_BASE}/bookings`);
      const bookings = Array.isArray(bookingsResponse?.data) ? bookingsResponse.data : 
                      Array.isArray(bookingsResponse) ? bookingsResponse : [];
      
      console.log("[respondInvite] Available bookings count:", bookings.length);
      
      // Cari booking yang invoice_number-nya sesuai
      const matchingBooking = bookings.find((booking: any) => 
        booking.invoice_number === invoiceNumber
      );
      
      if (matchingBooking) {
        numericBookingId = matchingBooking.id;
        console.log("[respondInvite] Found booking ID:", numericBookingId, "for invoice:", invoiceNumber);
      } else {
        console.warn("[respondInvite] No booking found for invoice:", invoiceNumber);
        
        // Fallback: cari berdasarkan partial match
        const partialMatch = bookings.find((booking: any) => 
          booking.invoice_number && booking.invoice_number.includes(invoiceNumber.replace(/^INV-/, ''))
        );
        
        if (partialMatch) {
          numericBookingId = partialMatch.id;
          console.log("[respondInvite] Found partial match booking ID:", numericBookingId);
        }
      }
    } catch (bookingsError) {
      console.error("[respondInvite] Bookings search failed:", bookingsError);
    }

    // 4. Jika tidak ditemukan, coba collaborations endpoint
    if (!numericBookingId) {
      console.log("[respondInvite] Trying collaborations endpoint...");
      try {
        const collaborationsResponse = await fetchJSON(`${API_BASE}/mua/collaborations`);
        const collaborations = Array.isArray(collaborationsResponse?.data) ? collaborationsResponse.data : 
                             Array.isArray(collaborationsResponse) ? collaborationsResponse : [];
        
        // Cari collaboration yang pending untuk notifikasi ini
        const pendingCollaboration = collaborations.find((collab: any) => 
          collab.status === 'invited' && collab.notification_id === notif.id
        );
        
        if (pendingCollaboration) {
          console.log("[respondInvite] Found pending collaboration:", pendingCollaboration);
          
          // Update langsung di collaborations
          const updateResponse = await fetchJSON(`${API_BASE}/mua/collaborations/${pendingCollaboration.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: status })
          });
          
          console.log("[respondInvite] Collaboration update success:", updateResponse);
          
          await markRead(notif.id, true);
          setItems(prev => prev.filter(item => item.id !== notif.id));
          await fetchUnreadCount();
          
          Alert.alert("Sukses", 
            action === "accept" ? "Undangan berhasil diterima!" : "Undangan berhasil ditolak."
          );
          return;
        }
      } catch (collabError) {
        console.warn("[respondInvite] Collaborations approach failed:", collabError);
      }
      
      // Jika masih tidak ditemukan, beri error
      Alert.alert(
        "Error", 
        `Tidak dapat menemukan data booking untuk:\n${invoiceNumber}\n\nSilakan hubungi administrator.`
      );
      return;
    }

    // 5. Gunakan numeric booking ID untuk respond
    console.log("[respondInvite] Using numeric booking ID:", numericBookingId);
    
    const response = await fetchJSON(`${API_BASE}/bookings/${numericBookingId}/collaborators/respond`, {
      method: "POST",
      body: JSON.stringify({ 
        status: status,
        notification_id: notif.id,
        user_id: authData.user.id
      }),
    });

    console.log("[respondInvite] Success:", response);

    await markRead(notif.id, true);
    setItems(prev => prev.filter(item => item.id !== notif.id));
    await fetchUnreadCount();
    
    Alert.alert("Sukses", 
      action === "accept" ? "Undangan berhasil diterima!" : "Undangan berhasil ditolak."
    );

  } catch (error: any) {
    console.error("[respondInvite] Error:", error);
    
    let errorMessage = "Terjadi kesalahan saat memproses undangan";
    
    if (error.message.includes("Not found") || error.message.includes("not invited")) {
      errorMessage = `
Undangan tidak ditemukan atau sudah kedaluwarsa. 

Kemungkinan penyebab:
• Data collaboration tidak ditemukan di database
• Undangan sudah direspon sebelumnya
• Ada ketidaksesuaian data

Silakan hubungi administrator.
`;
    } else {
      errorMessage = error.message || errorMessage;
    }
    
    Alert.alert("Gagal", errorMessage);
  }
}, [markRead, fetchUnreadCount]);

  // Invite Card Component
  const InviteCard = useCallback(
    ({ item }: { item: Notif }) => {
      const bookingId = extractBookingIdFromMessage(item.message);
      
      return (
        <View style={styles.cardInvite}>
          <View style={styles.inviteHeader}>
            <Text style={styles.titleInvite} numberOfLines={2}>
              {item.title ?? "Undangan Kolaborasi"}
            </Text>
            <Text style={styles.inviteTime}>
              {fmtTime(item.created_at)}
            </Text>
          </View>

          <Text style={styles.msgInvite}>
            {String(item.message ?? "")}
          </Text>

          <Text style={styles.metaInvite}>
            Booking ID: <Text style={{ fontWeight: "800" }}>
              {bookingId || "tidak terdeteksi"}
            </Text>
          </Text>

          <View style={styles.inviteActions}>
            <TouchableOpacity
              style={styles.btnAccept}
              onPress={() =>
                Alert.alert(
                  "Terima Undangan", 
                  "Anda yakin ingin menerima undangan kolaborasi ini?",
                  [
                    { text: "Batal", style: "cancel" },
                    { text: "Terima", onPress: () => respondInvite(item, "accept") },
                  ]
                )
              }
            >
              <Text style={styles.btnAcceptText}>Terima</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnDecline}
              onPress={() =>
                Alert.alert(
                  "Tolak Undangan", 
                  "Anda yakin ingin menolak undangan kolaborasi ini?",
                  [
                    { text: "Batal", style: "cancel" },
                    { text: "Tolak", style: "destructive", onPress: () => respondInvite(item, "decline") },
                  ]
                )
              }
            >
              <Text style={styles.btnDeclineText}>Tolak</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [respondInvite]
  );

  const renderItem = useCallback(
    ({ item }: { item: Notif }) => {
      const m = String(item.message ?? "");
      const isInvite = item.type === "booking_invite" || /mengundang|undang|kolaborasi|collaborat/i.test(m.toLowerCase());
      
      console.log("[renderItem] Notification type:", item.type, "isInvite:", isInvite);

      if (isInvite) {
        return (
          <View style={styles.inviteContainer}>
            <InviteCard item={item} />
          </View>
        );
      }

      const color = item.type === "booking" ? "#0EA5E9" : 
                   item.type === "payment" ? "#10B981" : "#A78BFA";

      return (
        <TouchableOpacity
          onPress={() => router.push({ 
            pathname: "/(mua)/notifications/[id]", 
            params: { id: String(item.id) } 
          })}
          style={[styles.card, !item.is_read && styles.unreadCard]}
          activeOpacity={0.9}
        >
          <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
            <Text style={{ color, fontWeight: "800", fontSize: 12 }}>
              {(item.type ?? "system").toUpperCase()}
            </Text>
          </View>
          
          <View style={styles.cardContent}>
            <Text style={[styles.title, !item.is_read && styles.unreadTitle]} numberOfLines={2}>
              {item.title || "No Title"}
            </Text>
            <Text style={styles.msg} numberOfLines={2}>
              {String(item.message ?? "")}
            </Text>
            <Text style={styles.time}>
              {fmtTime(item.created_at)}
            </Text>
          </View>

          {!item.is_read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      );
    },
    [InviteCard, router]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={styles.loadingText}>Memuat notifikasi…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifikasi</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={markAllRead} style={styles.hBtn}>
            <Ionicons name="checkmark-done-outline" size={16} color={PURPLE} />
            <Text style={styles.hBtnText}>Tandai Baca</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={clearRead} style={styles.hBtn}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={styles.hBtnText}>Bersihkan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {unreadCount > 0 && (
        <View style={styles.counterRow}>
          <Text style={styles.counterText}>Notifikasi belum dibaca</Text>
          <View style={styles.counterBadge}>
            <Text style={styles.counterBadgeText}>{unreadCount}</Text>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[PURPLE]}
            tintColor={PURPLE}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          items.length === 0 && styles.emptyListContent
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={renderItem}
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        ListFooterComponent={
          busy ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={PURPLE} />
              <Text style={styles.footerText}>Memuat lebih banyak...</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color={MUTED} />
            <Text style={styles.emptyTitle}>Tidak ada notifikasi</Text>
            <Text style={styles.emptyText}>
              Notifikasi baru akan muncul di sini
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#fff", 
    paddingTop: Platform.select({ ios: 12, android: 8 }) 
  },
  center: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: "#fff" 
  },
  loadingText: {
    color: MUTED, 
    marginTop: 12,
    fontSize: 14
  },
  header: { 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { 
    fontWeight: "800", 
    fontSize: 20, 
    color: TEXT 
  },
  headerActions: {
    flexDirection: "row", 
    gap: 8
  },
  hBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6, 
    paddingHorizontal: 12, 
    height: 36, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: BORDER, 
    backgroundColor: "#fff" 
  },
  hBtnText: { 
    color: "#111827", 
    fontWeight: "600",
    fontSize: 12,
  },
  counterRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    backgroundColor: "#F8FAFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  counterText: {
    color: MUTED,
    fontSize: 14
  },
  counterBadge: { 
    backgroundColor: PURPLE, 
    paddingHorizontal: 12, 
    height: 24, 
    borderRadius: 12, 
    alignItems: "center", 
    justifyContent: "center",
    minWidth: 24,
  },
  counterBadgeText: { 
    color: "#fff", 
    fontWeight: "800", 
    fontSize: 12 
  },
  listContent: {
    paddingHorizontal: 16, 
    paddingBottom: 24,
  },
  emptyListContent: {
    flex: 1
  },
  separator: {
    height: 10
  },
  inviteContainer: {
    paddingHorizontal: 16,
  },
  card: { 
    borderWidth: 1, 
    borderColor: BORDER, 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 16, 
    flexDirection: "row", 
    alignItems: "flex-start",
    position: "relative",
  },
  unreadCard: {
    backgroundColor: "#F8FAFF", 
    borderColor: "#DBEAFE"
  },
  cardContent: {
    flex: 1,
    marginRight: 12
  },
  badgeType: { 
    borderWidth: 1, 
    paddingVertical: 4, 
    paddingHorizontal: 8, 
    borderRadius: 6, 
    marginRight: 12,
    alignSelf: 'flex-start',
  },
  title: { 
    fontWeight: "600", 
    color: TEXT,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  unreadTitle: {
    color: TEXT, 
    fontWeight: "800" 
  },
  msg: { 
    color: MUTED, 
    fontSize: 14,
    lineHeight: 18,
  },
  time: { 
    color: MUTED, 
    marginTop: 8, 
    fontSize: 12 
  },
  unreadDot: { 
    position: "absolute", 
    right: 12, 
    top: 12, 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: "#EF4444" 
  },
  cardInvite: {
    borderWidth: 2,
    borderColor: PURPLE,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
  },
  inviteHeader: {
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "flex-start",
    marginBottom: 8,
  },
  titleInvite: { 
    fontWeight: "900", 
    fontSize: 16, 
    color: TEXT,
    flex: 1,
    marginRight: 12
  },
  inviteTime: { 
    color: MUTED, 
    fontSize: 12 
  },
  msgInvite: { 
    color: MUTED,
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 8
  },
  metaInvite: { 
    color: MUTED, 
    fontSize: 13 
  },
  inviteActions: {
    flexDirection: "row", 
    marginTop: 12, 
    gap: 8,
    alignItems: "center"
  },
  btnAccept: {
    backgroundColor: "#10B981",
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnAcceptText: { 
    color: "#fff", 
    fontWeight: "800",
    fontSize: 14
  },
  btnDecline: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnDeclineText: { 
    color: "#111827", 
    fontWeight: "700",
    fontSize: 14
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    color: MUTED,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});