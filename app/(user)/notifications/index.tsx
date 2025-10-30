import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import authStorage from "../../../utils/authStorage"; // ✅ GUNAKAN AUTH STORAGE YANG SAMA

const API = "https://smstudio.my.id/api";
const API_LIST = `${API}/notifications`;
const API_UNREAD = `${API}/notifications/unread-count`;
const API_READ = (id: string|number) => `${API}/notifications/${id}/read`;
const API_READ_ALL = `${API}/notifications/read-all`;
const API_DEL = (id: string|number) => `${API}/notifications/${id}`;
const API_DEL_ALL = `${API}/notifications`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const TEXT = "#111827";
const CARD_BG = "#F7F2FA";

type Notif = {
  id: string|number;
  user_id: string;
  title: string;
  message: string;
  type: "booking"|"system"|"payment";
  is_read: boolean;
  created_at?: string;
};

type Paged<T> = { 
  data: T[]; 
  current_page: number; 
  last_page: number; 
  per_page: number; 
  total: number 
};

// ✅ GUNAKAN AUTH STORAGE YANG SAMA
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

const fmtTime = (iso?: string)=> {
  if(!iso) return "-";
  const d = new Date(iso);
  if(!Number.isFinite(+d)) return iso;
  return d.toLocaleString("id-ID",{ 
    day:"2-digit", 
    month:"long", 
    year:"numeric", 
    hour:"2-digit", 
    minute:"2-digit" 
  });
};

export default function NotificationsScreen(){
  const router = useRouter();

  const [items, setItems] = useState<Notif[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchUnread = useCallback(async ()=>{
    try{
      const headers = await getAuthHeaders();
      const res = await fetch(API_UNREAD, { headers, cache:"no-store" });
      
      if (res.status === 401) {
        await authStorage.clearAuthAll();
        router.replace("/(auth)/login");
        return;
      }
      
      const j = await res.json();
      setUnreadCount(Number(j?.count||0));
    }catch(error){
      console.warn("[fetchUnread] Error:", error);
    }
  },[router]);

  const fetchPage = useCallback(async (p=1)=>{
    const headers = await getAuthHeaders();
    const url = `${API_LIST}?per_page=20&page=${p}`;
    const res = await fetch(url, { headers, cache:"no-store" });
    const txt = await res.text();
    
    if (!res.ok) {
      if (res.status === 401) {
        await authStorage.clearAuthAll();
        router.replace("/(auth)/login");
        throw new Error("Sesi berakhir. Silakan login kembali.");
      }
      
      let msg = `HTTP ${res.status}`;
      try{ msg = JSON.parse(txt)?.message || msg; }catch{}
      throw new Error(msg);
    }
    
    const j: Paged<Notif>|Notif[] = JSON.parse(txt);
    const list = Array.isArray((j as any)?.data) ? (j as any).data : (Array.isArray(j) ? j : []);
    const last = (j as any)?.last_page ?? (list.length<20 ? 1 : p);
    return { list, lastPage: Number(last)||p };
  },[router]);

  // initial load
  useEffect(()=>{
    (async()=>{
      try{
        setLoading(true);
        const { list, lastPage } = await fetchPage(1);
        setItems(list);
        setPage(1);
        setHasMore(1 < lastPage);
        fetchUnread();
      }catch(e:any){
        console.error("[NotificationsScreen] Initial load error:", e);
        if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
          Alert.alert("Oops", e?.message || "Gagal memuat notifikasi");
        }
        setItems([]);
      }finally{
        setLoading(false);
      }
    })();
  },[fetchPage, fetchUnread]);

  const onRefresh = useCallback(async ()=>{
    setRefreshing(true);
    try{
      const { list, lastPage } = await fetchPage(1);
      setItems(list);
      setPage(1);
      setHasMore(1 < lastPage);
      fetchUnread();
    }catch(e: any){
      console.error("[NotificationsScreen] Refresh error:", e);
      if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
        Alert.alert("Error", "Gagal memuat ulang notifikasi");
      }
    }finally{
      setRefreshing(false);
    }
  },[fetchPage, fetchUnread]);

  const loadMore = useCallback(async ()=>{
    if(loading || busy || !hasMore) return;
    setBusy(true);
    try{
      const next = page+1;
      const { list, lastPage } = await fetchPage(next);
      setItems(prev=>[...prev, ...list]);
      setPage(next);
      setHasMore(next < lastPage);
    }catch(e: any){
      console.error("[NotificationsScreen] Load more error:", e);
      if (e?.message !== "Sesi berakhir. Silakan login kembali.") {
        Alert.alert("Error", "Gagal memuat lebih banyak notifikasi");
      }
    }finally{ 
      setBusy(false); 
    }
  },[page, fetchPage, hasMore, loading, busy]);

  // actions
  const markRead = async (id: string|number, read=true)=>{
    try{
      const headers = await getAuthHeaders();
      await fetch(API_READ(id), { 
        method:"PATCH", 
        headers, 
        body: JSON.stringify({ is_read: read }) 
      });
      setItems(prev=>prev.map(n=> n.id===id ? { ...n, is_read: read } : n));
      fetchUnread();
    }catch(error){
      console.warn("[markRead] Error:", error);
      Alert.alert("Error", "Gagal menandai notifikasi");
    }
  };

  const deleteOne = async (id: string|number)=>{
    Alert.alert(
      "Hapus Notifikasi",
      "Apakah Anda yakin ingin menghapus notifikasi ini?",
      [
        { text: "Batal", style: "cancel" },
        { 
          text: "Hapus", 
          style: "destructive",
          onPress: async () => {
            try{
              const headers = await getAuthHeaders();
              await fetch(API_DEL(id), { method:"DELETE", headers });
              setItems(prev=>prev.filter(n=> n.id!==id));
              fetchUnread();
            }catch(error){
              console.warn("[deleteOne] Error:", error);
              Alert.alert("Error", "Gagal menghapus notifikasi");
            }
          }
        },
      ]
    );
  };

  const markAllRead = async ()=>{
    Alert.alert(
      "Tandai Semua Dibaca",
      "Apakah Anda yakin ingin menandai semua notifikasi sebagai sudah dibaca?",
      [
        { text: "Batal", style: "cancel" },
        { 
          text: "Tandai Semua", 
          onPress: async () => {
            try{
              const headers = await getAuthHeaders();
              await fetch(API_READ_ALL, { method:"PATCH", headers });
              setItems(prev=>prev.map(n=> ({...n, is_read:true})));
              fetchUnread();
              Alert.alert("Berhasil", "Semua notifikasi telah ditandai sebagai dibaca");
            }catch(error){
              console.warn("[markAllRead] Error:", error);
              Alert.alert("Error", "Gagal menandai semua notifikasi sebagai dibaca");
            }
          }
        },
      ]
    );
  };

  const clearRead = async ()=>{
    Alert.alert(
      "Bersihkan Notifikasi Dibaca",
      "Apakah Anda yakin ingin menghapus semua notifikasi yang sudah dibaca?",
      [
        { text: "Batal", style: "cancel" },
        { 
          text: "Bersihkan", 
          style: "destructive",
          onPress: async () => {
            try{
              const headers = await getAuthHeaders();
              await fetch(`${API_DEL_ALL}?only_read=true`, { method:"DELETE", headers });
              setItems(prev=>prev.filter(n=> !n.is_read));
              fetchUnread();
              Alert.alert("Berhasil", "Notifikasi yang sudah dibaca telah dihapus");
            }catch(error){
              console.warn("[clearRead] Error:", error);
              Alert.alert("Error", "Gagal membersihkan notifikasi yang sudah dibaca");
            }
          }
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Notif })=>{
    const color = item.type==="booking" ? "#0EA5E9" : item.type==="payment" ? "#10B981" : "#A78BFA";
    return (
      <TouchableOpacity
        onPress={()=> router.push({ pathname:"/(user)/notifications/[id]", params:{ id:String(item.id) } })}
        style={[styles.card, !item.is_read && { backgroundColor:"#F8FAFF", borderColor:"#DBEAFE" }]}
        activeOpacity={0.9}
      >
        <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <Text style={{ color, fontWeight:"800", fontSize:12 }}>{item.type.toUpperCase()}</Text>
        </View>
        <View style={{ flex:1 }}>
          <Text style={[styles.title, !item.is_read && { color:TEXT, fontWeight: "800" }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.msg} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.time}>{fmtTime(item.created_at)}</Text>
        </View>

        {/* Quick actions */}
        <View style={{ marginLeft:10, alignItems:"flex-end", gap:8 }}>
          <TouchableOpacity 
            onPress={()=> markRead(item.id, !item.is_read)} 
            style={styles.iconBtn}
            accessibilityLabel={item.is_read ? "Tandai belum dibaca" : "Tandai sudah dibaca"}
          >
            <Ionicons 
              name={item.is_read? "mail-open-outline":"mail-unread-outline"} 
              size={18} 
              color={item.is_read ? MUTED : PURPLE} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={()=> deleteOne(item.id)} 
            style={[styles.iconBtn,{ backgroundColor:"#FEE2E2", borderColor:"#FCA5A5" }]}
            accessibilityLabel="Hapus notifikasi"
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  if(loading){
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PURPLE}/>
        <Text style={{ color:MUTED, marginTop:12 }}>Memuat notifikasi…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifikasi</Text>
        <View style={{ flexDirection:"row", gap:8 }}>
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

      {/* Counter */}
      {unreadCount > 0 && (
        <View style={styles.counterRow}>
          <Text style={{ color:MUTED }}>Notifikasi belum dibaca</Text>
          <View style={styles.counterBadge}>
            <Text style={{ color:"#fff", fontWeight:"800", fontSize:12 }}>{unreadCount}</Text>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(it)=> String(it.id)}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[PURPLE]}
            tintColor={PURPLE}
          />
        }
        contentContainerStyle={{ 
          paddingHorizontal:16, 
          paddingBottom:24,
          flex: items.length === 0 ? 1 : undefined 
        }}
        ItemSeparatorComponent={()=> <View style={{ height:10 }}/>}
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
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={onRefresh}
            >
              <Text style={styles.refreshButtonText}>Muat Ulang</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ 
    flex:1, 
    backgroundColor:"#fff", 
    paddingTop: Platform.select({ ios: 12, android: 8 }) 
  },
  center:{ 
    flex:1, 
    alignItems:"center", 
    justifyContent:"center", 
    backgroundColor:"#fff" 
  },
  header:{ 
    paddingHorizontal:16, 
    paddingVertical:12, 
    flexDirection:"row", 
    justifyContent:"space-between", 
    alignItems:"center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle:{ 
    fontWeight:"800", 
    fontSize:20, 
    color:TEXT 
  },
  hBtn:{ 
    flexDirection:"row", 
    alignItems:"center", 
    gap:6, 
    paddingHorizontal:12, 
    height:36, 
    borderRadius:8, 
    borderWidth:1, 
    borderColor:BORDER, 
    backgroundColor:"#fff" 
  },
  hBtnText:{ 
    color:"#111827", 
    fontWeight:"600",
    fontSize: 12,
  },

  counterRow:{ 
    flexDirection:"row", 
    alignItems:"center", 
    justifyContent:"space-between", 
    paddingHorizontal:16, 
    paddingVertical: 12,
    backgroundColor: "#F8FAFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  counterBadge:{ 
    backgroundColor:PURPLE, 
    paddingHorizontal:12, 
    height:24, 
    borderRadius:12, 
    alignItems:"center", 
    justifyContent:"center",
    minWidth: 24,
  },

  card:{ 
    borderWidth:1, 
    borderColor:BORDER, 
    backgroundColor:"#fff", 
    borderRadius:12, 
    padding:16, 
    flexDirection:"row", 
    alignItems:"flex-start",
    position: "relative",
  },
  badgeType:{ 
    borderWidth:1, 
    paddingVertical:4, 
    paddingHorizontal:8, 
    borderRadius:6, 
    marginRight:12,
    alignSelf: 'flex-start',
  },
  title:{ 
    fontWeight:"600", 
    color:TEXT,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  msg:{ 
    color:MUTED, 
    fontSize: 14,
    lineHeight: 18,
  },
  time:{ 
    color:MUTED, 
    marginTop:8, 
    fontSize:12 
  },
  iconBtn:{ 
    width:36, 
    height:36, 
    borderRadius:8, 
    borderWidth:1, 
    borderColor:BORDER, 
    backgroundColor:"#fff", 
    alignItems:"center", 
    justifyContent:"center" 
  },
  unreadDot:{ 
    position:"absolute", 
    right:12, 
    top:12, 
    width:8, 
    height:8, 
    borderRadius:4, 
    backgroundColor:"#EF4444" 
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
  refreshButton: {
    backgroundColor: PURPLE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});