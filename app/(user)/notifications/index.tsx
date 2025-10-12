import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";

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

type Paged<T> = { data: T[]; current_page: number; last_page: number; per_page: number; total: number };

async function getToken(){ try{ const raw = await SecureStore.getItemAsync("auth"); if(!raw) return null; const j = JSON.parse(raw); return j?.token||null; }catch{ return null; } }
const fmtTime = (iso?: string)=> {
  if(!iso) return "-";
  const d = new Date(iso);
  if(!Number.isFinite(+d)) return iso;
  return d.toLocaleString("id-ID",{ day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
};

export default function NotificationsScreen(){
  const router = useRouter();
  const [token, setToken] = useState<string|null>(null);

  const [items, setItems] = useState<Notif[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // ambil token
  useEffect(()=>{ (async()=>{ setToken(await getToken()); })(); },[]);

  const headers = useMemo(()=>({
    Accept: "application/json",
    ...(token? { Authorization: `Bearer ${token}` } : {})
  }),[token]);

  const fetchUnread = useCallback(async ()=>{
    try{
      const res = await fetch(API_UNREAD, { headers, cache:"no-store" });
      const j = await res.json();
      setUnreadCount(Number(j?.count||0));
    }catch{}
  },[headers]);

  const fetchPage = useCallback(async (p=1)=>{
    const url = `${API_LIST}?per_page=20&page=${p}`;
    const res = await fetch(url, { headers, cache:"no-store" });
    const txt = await res.text();
    if(!res.ok){
      let msg = `HTTP ${res.status}`;
      try{ msg = JSON.parse(txt)?.message || msg; }catch{}
      throw new Error(msg);
    }
    const j: Paged<Notif>|Notif[] = JSON.parse(txt);
    const list = Array.isArray((j as any)?.data) ? (j as any).data : (Array.isArray(j) ? j : []);
    const last = (j as any)?.last_page ?? (list.length<20 ? 1 : p); // fallback
    return { list, lastPage: Number(last)||p };
  },[headers]);

  // initial load
  useEffect(()=>{
    if(!token) { setLoading(false); return; }
    (async()=>{
      try{
        setLoading(true);
        const { list, lastPage } = await fetchPage(1);
        setItems(list);
        setPage(1);
        setHasMore(1 < lastPage);
        fetchUnread();
      }catch(e:any){
        Alert.alert("Oops", e?.message || "Gagal memuat notifikasi");
        setItems([]);
      }finally{
        setLoading(false);
      }
    })();
  },[token, fetchPage, fetchUnread]);

  const onRefresh = useCallback(async ()=>{
    setRefreshing(true);
    try{
      const { list, lastPage } = await fetchPage(1);
      setItems(list);
      setPage(1);
      setHasMore(1 < lastPage);
      fetchUnread();
    }catch{}
    setRefreshing(false);
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
    }catch{}finally{ setBusy(false); }
  },[page, fetchPage, hasMore, loading, busy]);

  // actions
  const markRead = async (id: string|number, read=true)=>{
    try{
      await fetch(API_READ(id), { method:"PATCH", headers:{ ...headers, "Content-Type":"application/json" }, body: JSON.stringify({ is_read: read }) });
      setItems(prev=>prev.map(n=> n.id===id ? { ...n, is_read: read } : n));
      fetchUnread();
    }catch{}
  };
  const deleteOne = async (id: string|number)=>{
    try{
      await fetch(API_DEL(id), { method:"DELETE", headers });
      setItems(prev=>prev.filter(n=> n.id!==id));
      fetchUnread();
    }catch{}
  };
  const markAllRead = async ()=>{
    try{
      await fetch(API_READ_ALL, { method:"PATCH", headers });
      setItems(prev=>prev.map(n=> ({...n, is_read:true})));
      fetchUnread();
    }catch{}
  };
  const clearRead = async ()=>{
    try{
      await fetch(`${API_DEL_ALL}?only_read=true`, { method:"DELETE", headers });
      setItems(prev=>prev.filter(n=> !n.is_read));
      fetchUnread();
    }catch{}
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
          <Text style={[styles.title, !item.is_read && { color:TEXT }]} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.msg} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.time}>{fmtTime(item.created_at)}</Text>
        </View>

        {/* Quick actions */}
        <View style={{ marginLeft:10, alignItems:"flex-end", gap:8 }}>
          <TouchableOpacity onPress={()=> markRead(item.id, !item.is_read)} style={styles.iconBtn}>
            <Ionicons name={item.is_read? "mail-open-outline":"mail-unread-outline"} size={18} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity onPress={()=> deleteOne(item.id)} style={[styles.iconBtn,{ backgroundColor:"#FEE2E2", borderColor:"#FCA5A5" }]}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  if(loading){
    return <View style={styles.center}><ActivityIndicator color={PURPLE}/><Text style={{ color:MUTED, marginTop:6 }}>Memuat…</Text></View>;
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifikasi</Text>
        <View style={{ flexDirection:"row", gap:8 }}>
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

      {/* Counter */}
      <View style={styles.counterRow}>
        <Text style={{ color:MUTED }}>Belum dibaca</Text>
        <View style={styles.counterBadge}>
          <Text style={{ color:"#fff", fontWeight:"800" }}>{unreadCount}</Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it)=> String(it.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal:16, paddingBottom:24 }}
        ItemSeparatorComponent={()=> <View style={{ height:10 }}/>}
        renderItem={renderItem}
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        ListFooterComponent={busy? <ActivityIndicator style={{ marginTop:8 }}/>: null}
        ListEmptyComponent={<Text style={{ color:MUTED, padding:16 }}>Tidak ada notifikasi.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:"#fff", paddingTop: Platform.select({ ios: 8, android: 4 }) },
  center:{ flex:1, alignItems:"center", justifyContent:"center", backgroundColor:"#fff" },
  header:{ paddingHorizontal:16, paddingVertical:10, flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  headerTitle:{ fontWeight:"800", fontSize:18, color:TEXT },
  hBtn:{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, height:34, borderRadius:8, borderWidth:1, borderColor:BORDER, backgroundColor:"#fff" },
  hBtnText:{ color:"#111827", fontWeight:"700" },

  counterRow:{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, paddingBottom:6 },
  counterBadge:{ backgroundColor:PURPLE, paddingHorizontal:10, height:26, borderRadius:13, alignItems:"center", justifyContent:"center" },

  card:{ borderWidth:1, borderColor:BORDER, backgroundColor:"#fff", borderRadius:12, padding:12, flexDirection:"row", alignItems:"center" },
  badgeType:{ borderWidth:1, paddingVertical:4, paddingHorizontal:8, borderRadius:999, marginRight:10 },
  title:{ fontWeight:"800", color:TEXT },
  msg:{ color:MUTED, marginTop:4 },
  time:{ color:MUTED, marginTop:6, fontSize:12 },
  iconBtn:{ width:34, height:34, borderRadius:8, borderWidth:1, borderColor:BORDER, backgroundColor:"#fff", alignItems:"center", justifyContent:"center" },
  unreadDot:{ position:"absolute", right:8, top:8, width:10, height:10, borderRadius:5, backgroundColor:"#EF4444" },
});
