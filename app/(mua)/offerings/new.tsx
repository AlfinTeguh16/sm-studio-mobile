import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";


const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";
const TEXT_MUTED = "#6B7280";

type Me = { id?: string; profile?: { id?: string } };
type LocalImage = { uri: string; name: string; type: string };

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
const isContentUri = (uri: string) => uri.startsWith("content://");

/** Kompres ringan (resize width max 1600, jpeg 0.8) */
async function compressImage(uri: string): Promise<LocalImage> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: out.uri, name: `photo_${Date.now()}.jpg`, type: "image/jpeg" };
}

/** Upload via fetch (FormData, multi file) */
async function uploadWithFetch(offeringId: string, token: string, files: LocalImage[]) {
  const fd = new FormData();
  (fd as any).append("_method", "PATCH");
  files.forEach((f) => {
    (fd as any).append("offer_images[]", { uri: f.uri, name: f.name, type: f.type } as any);
  });
  const res = await fetch(`${API}/offerings/${encodeURIComponent(offeringId)}`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, // <== TANPA Content-Type
    body: fd as any,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || "Upload foto gagal.");
  return j;
}


const MULTIPART: any =
  (FileSystem as any)?.FileSystemUploadType?.MULTIPART ??
  (FileSystem as any)?.UploadType?.MULTIPART ??
  "multipart";

async function uploadWithUploadAsync(offeringId: string, token: string, files: { uri: string; name: string; type: string }[]) {
  const url = `${API}/offerings/${encodeURIComponent(offeringId)}?_method=PATCH`;
  for (const f of files) {
    const res = await FileSystem.uploadAsync(url, f.uri, {
      httpMethod: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      uploadType: MULTIPART,     
      fieldName: "offer_images[]",
      mimeType: f.type,
      parameters: {},                  // tambahkan fields lain jika perlu
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Upload gagal (${res.status}): ${res.body || ""}`);
    }
  }
}



export default function OfferingCreate() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [muaId, setMuaId] = useState<string | null>(null);

  const [nameOffer, setNameOffer] = useState("");
  const [makeupType, setMakeupType] = useState<"bridal"|"party"|"photoshoot"|"graduation"|"sfx"|"">("");
  const [person, setPerson] = useState(1);

  const [useDate, setUseDate] = useState(false);
  const [date, setDate] = useState<Date>(() => { const d=new Date(); d.setDate(d.getDate()+1); return d; });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [priceStr, setPriceStr] = useState("");
  const priceNum = useMemo(()=> Number(priceStr.replace(/[^\d]/g,"")) || 0, [priceStr]);

  const [collabName, setCollabName] = useState("");
  const [collabPriceStr, setCollabPriceStr] = useState("");
  const collabPriceNum = useMemo(()=> (collabName.trim()? Number(collabPriceStr.replace(/[^\d]/g,""))||0 : null), [collabName, collabPriceStr]);

  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(()=>{ (async ()=>{
    try {
      const raw = await SecureStore.getItemAsync("auth").catch(()=>null);
      if (raw) {
        const auth = JSON.parse(raw);
        if (auth?.token) setToken(auth.token);
        const id = auth?.profile?.id || auth?.user?.id;
        if (id) setMuaId(String(id));
      }
    } catch {}
  })(); }, []);

  useEffect(()=>{ (async ()=>{
    if (!muaId && token) {
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Accept:"application/json", Authorization:`Bearer ${token}` },
        });
        if (res.ok) {
          const me: Me = await res.json();
          const id = me?.profile?.id || me?.id;
          if (id) setMuaId(String(id));
        }
      } catch {}
    }
  })(); }, [token, muaId]);

  const pickImages = useCallback(async ()=>{
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status!=="granted") { Alert.alert("Izin dibutuhkan","Izinkan akses galeri."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection:true, mediaTypes:ImagePicker.MediaTypeOptions.Images, quality:1, selectionLimit:10,
    });
    if (result.canceled) return;

    const mapped:LocalImage[] = (result.assets||[]).slice(0,10).map((a,i)=>{
      const name = a.fileName || `photo_${Date.now()}_${i}.${(a.uri.split(".").pop()||"jpg").replace(/\?.*$/,"")}`;
      const type = a.mimeType || (name.toLowerCase().endsWith(".png")?"image/png":name.toLowerCase().endsWith(".webp")?"image/webp":"image/jpeg");
      return { uri:a.uri, name, type };
    });
    setLocalImages(prev => [...prev, ...mapped].slice(0,50));
  },[]);
  const removeLocalImage = (idx:number)=> setLocalImages(prev=>prev.filter((_,i)=>i!==idx));

  async function submit() {
    try {
      if (!muaId) throw new Error("Akun MUA belum terdeteksi.");
      if (!nameOffer.trim()) throw new Error("Nama paket wajib diisi.");
      if (!priceNum || priceNum<=0) throw new Error("Harga tidak valid.");
      if (person<1) throw new Error("Jumlah orang minimal 1.");
      if (collabName.trim() && (collabPriceNum==null || collabPriceNum<0)) throw new Error("Harga kolaborasi tidak valid.");

      const payload:any = {
        mua_id: muaId,
        name_offer: nameOffer.trim(),
        makeup_type: makeupType || null,
        person,
        collaboration: collabName.trim() || null,
        collaboration_price: collabName.trim() ? collabPriceNum : null,
        add_ons: [],
        date: useDate ? toYMD(date) : null,
        price: priceNum,
      };

      setSubmitting(true);
      const res = await fetch(`${API}/offerings`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Accept:"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
        body: JSON.stringify(payload),
      });
      const created = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(created?.message || created?.error || "Gagal menyimpan offering.");

      const newId = String(created?.id || created?.data?.id || "");
      if (!newId) { Alert.alert("Berhasil","Offering dibuat."); return; }

      // Upload foto jika ada
      if (localImages.length>0 && token) {
        setUploading(true);

        // Kompres semua dulu
        const compressed: LocalImage[] = [];
        for (const f of localImages) {
          // kompres hanya jika bukan jpeg atau tanpa extensi jelas
          const c = await compressImage(f.uri);
          compressed.push({ ...c, name: f.name.endsWith(".jpg")||f.name.endsWith(".jpeg")? f.name : c.name });
        }

        const hasContent = Platform.OS === "android" && compressed.some((f)=>isContentUri(f.uri));
        if (hasContent) {
          // Fallback per file
          await uploadWithUploadAsync(newId, token, compressed);
        } else {
          // Multi file sekali kirim
          await uploadWithFetch(newId, token, compressed);
        }
      }

      Alert.alert("Berhasil","Offering berhasil dibuat.",[
        { text:"Lihat", onPress:()=> router.replace({ pathname:"/(mua)/offerings/[id]", params:{ id:newId } }) },
        { text:"OK", onPress:()=> router.back() },
      ]);
    } catch(e:any) {
      Alert.alert("Gagal", e?.message || "Tidak bisa menyimpan offering.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={()=>router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={18} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buat Offering</Text>
          <View style={{ width:40 }}/>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Nama Paket *</Text>
          <TextInput value={nameOffer} onChangeText={setNameOffer} placeholder="Contoh: Bridal Package #1"
            placeholderTextColor="#9CA3AF" style={styles.input} />

          <Text style={[styles.label,{marginTop:10}]}>Jenis Make Up</Text>
          <View style={styles.segmentWrap}>
            {(["bridal","party","photoshoot","graduation","sfx"] as const).map((t)=>(
              <TouchableOpacity key={t} onPress={()=>setMakeupType(t===makeupType?"":t)}
                style={[styles.segment, makeupType===t && { backgroundColor: PURPLE, borderColor: PURPLE }]}>
                <Text style={[styles.segmentText, makeupType===t && { color:"#fff", fontWeight:"800" }]}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label,{marginTop:10}]}>Jumlah Orang</Text>
          <View style={styles.rowBetween}>
            <View />
            <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
              <TouchableOpacity style={styles.stepper} onPress={()=>setPerson(v=>Math.max(1,v-1))}>
                <Ionicons name="remove" size={16} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontWeight:"800" }}>{person}</Text>
              <TouchableOpacity style={styles.stepper} onPress={()=>setPerson(v=>v+1)}>
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.label,{marginTop:10}]}>Tanggal (Opsional)</Text>
          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
            <TouchableOpacity style={[styles.toggle, useDate && { backgroundColor:PURPLE, borderColor:PURPLE }]}
              onPress={()=>setUseDate(v=>!v)}>
              <Text style={[styles.toggleText, useDate && { color:"#fff", fontWeight:"800" }]}>
                {useDate ? "Aktif" : "Nonaktif"}
              </Text>
            </TouchableOpacity>
            {useDate && (
              <TouchableOpacity style={styles.dateBtn} onPress={()=>setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#111" />
                <Text style={{ fontWeight:"700", marginLeft:6 }}>
                  {date.toLocaleDateString("id-ID",{ day:"2-digit", month:"long", year:"numeric" })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {showDatePicker && (
            <DateTimePicker value={date} mode="date" display={Platform.OS==="ios"?"spinner":"default"}
              onChange={(_,d)=>{ if(d) setDate(d); setShowDatePicker(false); }} />
          )}

          <Text style={[styles.label,{marginTop:10}]}>Harga *</Text>
          <TextInput value={priceStr} onChangeText={(t)=>setPriceStr(t.replace(/[^\d]/g,""))}
            placeholder="cth: 1500000" placeholderTextColor="#9CA3AF" style={styles.input} keyboardType="numeric" />

          <Text style={[styles.label,{marginTop:10}]}>Kolaborasi (opsional)</Text>
          <TextInput value={collabName} onChangeText={setCollabName} placeholder="Nama partner/brand"
            placeholderTextColor="#9CA3AF" style={styles.input} />
          {collabName.trim() ? (
            <>
              <Text style={[styles.label,{marginTop:6}]}>Harga Kolaborasi</Text>
              <TextInput value={collabPriceStr} onChangeText={(t)=>setCollabPriceStr(t.replace(/[^\d]/g,""))}
                placeholder="cth: 300000" placeholderTextColor="#9CA3AF" style={styles.input} keyboardType="numeric" />
            </>
          ) : null}

          {/* Foto dari device */}
          <Text style={[styles.label,{marginTop:14}]}>Foto dari Device</Text>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
            <TouchableOpacity onPress={pickImages} style={styles.addLineBtn}>
              <Ionicons name="images" size={16} color={PURPLE} />
              <Text style={{ color: PURPLE, fontWeight:"800", marginLeft:6 }}>Pilih Foto</Text>
            </TouchableOpacity>
          </View>
          {localImages.length>0 ? (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginTop:8 }}>
              {localImages.map((img,i)=>(
                <View key={`${img.uri}-${i}`} style={styles.thumb}>
                  <Image source={{ uri: img.uri }} style={{ width:78, height:78, borderRadius:8 }} />
                  <TouchableOpacity onPress={()=>removeLocalImage(i)} style={styles.thumbRemove}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (<Text style={{ color: TEXT_MUTED, marginTop:6 }}>Belum ada foto.</Text>)}

          {uploading ? (
            <View style={{ marginTop:8, flexDirection:"row", alignItems:"center", gap:8 }}>
              <ActivityIndicator color={PURPLE} />
              <Text style={{ color: TEXT_MUTED }}>Mengunggah foto…</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.cta,(submitting||uploading)&&{opacity:.6}]} disabled={submitting||uploading} onPress={submit}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color:"#fff", fontWeight:"800" }}>Simpan Offering</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:"#fff" },
  header:{ paddingHorizontal:16, paddingTop:Platform.select({ ios:14, android:10 }), paddingBottom:8, flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  iconBtn:{ width:40, height:40, borderRadius:10, borderWidth:1, borderColor:BORDER, alignItems:"center", justifyContent:"center", backgroundColor:"#fff" },
  headerTitle:{ fontSize:18, fontWeight:"800", color:"#111827" },
  card:{ margin:16, padding:14, borderRadius:14, backgroundColor:CARD_BG, borderWidth:1, borderColor:"#EDE9FE" },
  label:{ fontWeight:"800", color:"#111827", marginBottom:6 },
  input:{ borderWidth:1, borderColor:BORDER, borderRadius:10, paddingHorizontal:12, height:44, backgroundColor:"#fff", color:"#111", marginBottom:8 },
  segmentWrap:{ flexDirection:"row", flexWrap:"wrap", gap:8 },
  segment:{ borderWidth:1, borderColor:BORDER, paddingVertical:8, paddingHorizontal:12, borderRadius:10, backgroundColor:"#fff" },
  segmentText:{ color:"#111827", fontWeight:"700" },
  rowBetween:{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  stepper:{ width:28, height:28, borderRadius:8, backgroundColor:PURPLE, alignItems:"center", justifyContent:"center" },
  toggle:{ borderWidth:1, borderColor:BORDER, paddingVertical:8, paddingHorizontal:12, borderRadius:10, backgroundColor:"#fff" },
  toggleText:{ color:"#111827", fontWeight:"700" },
  dateBtn:{ borderWidth:1, borderColor:BORDER, paddingVertical:8, paddingHorizontal:12, borderRadius:10, backgroundColor:"#fff", flexDirection:"row", alignItems:"center" },
  addLineBtn:{ marginTop:6, alignSelf:"flex-start", flexDirection:"row", alignItems:"center", paddingVertical:8, paddingHorizontal:10, borderRadius:10, borderWidth:1, borderColor:BORDER, backgroundColor:"#fff" },
  cta:{ position:"absolute", left:16, right:16, bottom:24, height:50, borderRadius:12, backgroundColor:PURPLE, alignItems:"center", justifyContent:"center" },
  thumb:{ position:"relative", width:78, height:78, borderRadius:10, overflow:"hidden", borderWidth:1, borderColor:BORDER },
  thumbRemove:{ position:"absolute", right:4, top:4, width:18, height:18, borderRadius:9, backgroundColor:"#0008", alignItems:"center", justifyContent:"center" },
});
