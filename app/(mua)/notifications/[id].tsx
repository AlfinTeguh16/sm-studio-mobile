import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API = "https://smstudio.my.id/api";
const API_SHOW = (id: string|number)=> `${API}/notifications/${id}`;
const API_READ = (id: string|number)=> `${API}/notifications/${id}/read`;
const API_DEL = (id: string|number)=> `${API}/notifications/${id}`;

const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const TEXT = "#111827";

type Notif = {
  id: string|number;
  user_id: string;
  title: string;
  message: string;
  type: "booking"|"system"|"payment";
  is_read: boolean;
  created_at?: string;
};

async function getToken(){ try{ const raw = await SecureStore.getItemAsync("auth"); if(!raw) return null; const j = JSON.parse(raw); return j?.token||null; }catch{ return null; } }
const fmtTime = (iso?: string)=> {
  if(!iso) return "-";
  const d = new Date(iso);
  if(!Number.isFinite(+d)) return iso;
  return d.toLocaleString("id-ID",{ weekday:"long", day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
};

export default function NotifDetail(){
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [token, setToken] = useState<string|null>(null);
  const [item, setItem] = useState<Notif|null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(()=>{ (async()=> setToken(await getToken()))(); },[]);

  useEffect(()=>{
    if(!id || !token){ setLoading(false); return; }
    (async()=>{
      try{
        setLoading(true);
        const res = await fetch(API_SHOW(id), { headers:{ Accept:"application/json", Authorization:`Bearer ${token}` } });
        const j = await res.json();
        const data: Notif = (j?.data ?? j) as Notif;
        setItem(data);

        // auto mark read jika belum
        if(data && !data.is_read){
          await fetch(API_READ(id), { method:"PATCH", headers:{ Accept:"application/json", Authorization:`Bearer ${token}` } });
          setItem(prev=> prev? { ...prev, is_read:true } : prev);
        }
      }catch(e:any){
        Alert.alert("Oops", e?.message || "Gagal memuat notifikasi");
      }finally{
        setLoading(false);
      }
    })();
  },[id, token]);

  const color = useMemo(()=>{
    const t = item?.type;
    return t==="booking" ? "#0EA5E9" : t==="payment" ? "#10B981" : "#A78BFA";
  },[item?.type]);

  const onDelete = async ()=>{
    if(!id || !token) return;
    try{
      setWorking(true);
      await fetch(API_DEL(id), { method:"DELETE", headers:{ Accept:"application/json", Authorization:`Bearer ${token}` } });
      Alert.alert("Berhasil","Notifikasi dihapus", [{ text:"OK", onPress:()=> router.back() }]);
    }catch(e:any){
      Alert.alert("Oops", e?.message || "Gagal menghapus");
    }finally{ setWorking(false); }
  };

  if(loading){
    return <View style={styles.center}><ActivityIndicator color={PURPLE}/></View>;
  }
  if(!item){
    return <View style={styles.center}><Text style={{ color:MUTED }}>Notifikasi tidak ditemukan.</Text></View>;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={()=>router.back()}>
          <Ionicons name="arrow-back" size={18} color={TEXT}/>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Detail Notifikasi</Text>
        <TouchableOpacity style={[styles.iconBtn, { borderColor:"#FCA5A5" }]} onPress={onDelete} disabled={working}>
          {working ? <ActivityIndicator/> : <Ionicons name="trash-outline" size={18} color="#DC2626"/>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:24 }}>
        <View style={[styles.badgeType, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <Text style={{ color, fontWeight:"800" }}>{item.type.toUpperCase()}</Text>
        </View>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.time}>{fmtTime(item.created_at)}</Text>

        <View style={styles.box}>
          <Text style={styles.msg}>{item.message}</Text>
        </View>

        {!item.is_read && (
          <View style={[styles.info, { backgroundColor:"#FFF7ED", borderColor:"#FED7AA" }]}>
            <Ionicons name="alert-circle-outline" size={18} color="#EA580C"/>
            <Text style={{ color:"#EA580C", marginLeft:6, flex:1 }}>Belum dibaca</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:"#fff", paddingTop: Platform.select({ ios: 8, android: 4 }) },
  center:{ flex:1, alignItems:"center", justifyContent:"center", backgroundColor:"#fff" },
  header:{ paddingHorizontal:16, paddingVertical:10, flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  headerTitle:{ fontWeight:"800", fontSize:18, color:TEXT, maxWidth:220, textAlign:"center" },
  iconBtn:{ height:38, paddingHorizontal:12, borderWidth:1, borderColor:BORDER, borderRadius:10, alignItems:"center", justifyContent:"center", backgroundColor:"#fff" },

  badgeType:{ alignSelf:"flex-start", borderWidth:1, borderRadius:999, paddingVertical:4, paddingHorizontal:10, marginBottom:10 },
  title:{ fontSize:20, fontWeight:"800", color:TEXT },
  time:{ color:MUTED, marginTop:4 },

  box:{ marginTop:12, padding:12, borderRadius:12, backgroundColor:"#ffffff", borderWidth:1, borderColor:"#E9DDF7" },
  msg:{ color:"#111827", lineHeight:20 },

  info:{ marginTop:12, padding:10, borderRadius:10, borderWidth:1, flexDirection:"row", alignItems:"center" },
});
