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
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

const API = "https://smstudio.my.id/api";
const PURPLE = "#AA60C8";
const BORDER = "#E5E7EB";
const CARD_BG = "#F7F2FA";

type Offering = { id: number; name_offer: string; price?: string | number };

// response paginated laravel
type Paginated<T> = {
  data: T[];
  next_page_url?: string | null;
  prev_page_url?: string | null;
  current_page?: number;
  total?: number;
};

export default function MuaOfferingsMine() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [muaId, setMuaId] = useState<string | null>(null);

  const [rows, setRows] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  /* ------------------ Auth bootstrap ------------------ */
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token) setToken(auth.token);
          const pid = auth?.profile?.id || auth?.user?.id;
          if (pid) setMuaId(String(pid));
        }
      } catch {}

      // fallback: /auth/me
      try {
        if (!muaId) {
          const res = await fetch(`${API}/auth/me`, {
            headers: {
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (res.ok) {
            const me = await res.json();
            const pid = me?.profile?.id || me?.id;
            if (pid) setMuaId(String(pid));
          }
        }
      } catch {}
    })();
  }, [token, muaId]);

  /* ------------------ Fetch helpers ------------------ */
  const mapRows = (json: any): { list: Offering[]; next: string | null } => {
    // handle paginated / plain array
    const data: Offering[] = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
      ? json
      : [];

    const next = json?.next_page_url ?? null;
    return { list: data, next };
  };

  const fetchMine = async (url?: string) => {
    // Utama: /offerings/mine (auth)
    const target = url ?? `${API}/offerings/mine?per_page=20`;
    const res = await fetch(target, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return res;
  };

  const fetchByQuery = async (url?: string) => {
    // Fallback: /offerings?muaId=...
    const target = url ?? `${API}/offerings?muaId=${muaId}&per_page=20`;
    const res = await fetch(target, { headers: { Accept: "application/json" } });
    return res;
  };

  const loadInitial = useCallback(async () => {
    if (!muaId) return;
    setLoading(true);
    setErrorText(null);
    try {
      // coba endpoint auth dulu
      let res = await fetchMine();
      if (res.status === 401 || res.status === 403) {
        // fallback ke filter query
        res = await fetchByQuery();
      }
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({})))?.message || "Gagal memuat offerings.";
        throw new Error(msg);
      }
      const json = await res.json();
      const { list, next } = mapRows(json);
      setRows(list);
      setNextUrl(next);
    } catch (e: any) {
      setRows([]);
      setNextUrl(null);
      setErrorText(e?.message || "Gagal memuat offerings.");
    } finally {
      setLoading(false);
    }
  }, [muaId, token]);

  const loadMore = useCallback(async () => {
    if (!nextUrl) return;
    try {
      // deteksi url dari endpoint yang mana (mine vs query)
      const isMine = nextUrl.includes("/offerings/mine");
      const res = isMine ? await fetchMine(nextUrl) : await fetchByQuery(nextUrl);
      if (!res.ok) return;
      const json = await res.json();
      const { list, next } = mapRows(json);
      setRows((prev) => [...prev, ...list]);
      setNextUrl(next);
    } catch {
      // noop
    }
  }, [nextUrl, token, muaId]);

  const onRefresh = useCallback(async () => {
    if (!muaId) return;
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [muaId, loadInitial]);

  // load awal + refetch saat kembali fokus
  useEffect(() => {
    if (muaId) loadInitial();
  }, [muaId, loadInitial]);

  useFocusEffect(
    useCallback(() => {
      // refresh ringan saat screen fokus (misal setelah create/edit)
      if (muaId) loadInitial();
    }, [muaId, loadInitial])
  );

  /* ------------------ UI ------------------ */
  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
    }
    if (errorText) {
      return (
        <View style={styles.center}>
          <Text style={{ color: "crimson", textAlign: "center", paddingHorizontal: 16 }}>
            {errorText}
          </Text>
          <TouchableOpacity style={[styles.addBtn, { marginTop: 12 }]} onPress={loadInitial}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 6 }}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <FlatList
        data={rows}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.2}
        onEndReached={() => {
          if (nextUrl) loadMore();
        }}
        ListFooterComponent={
          nextUrl ? (
            <View style={{ paddingVertical: 12 }}>
              <ActivityIndicator />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/(mua)/offerings/[id]", params: { id: String(item.id) } })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name_offer || "Tanpa Judul"}
              </Text>
              <Text style={styles.meta}>
                {item.price != null
                  ? `IDR ${new Intl.NumberFormat("id-ID").format(Number(item.price))}`
                  : "—"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#6B7280", padding: 16 }}>Belum ada offering.</Text>
        }
      />
    );
  }, [loading, errorText, rows, nextUrl, refreshing, onRefresh, loadMore, router]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Offerings Saya</Text>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/(mua)/offerings/new")}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 6 }}>Buat</Text>
        </TouchableOpacity>
      </View>

      {content}
    </View>
  );
}

/* ------------------ Styles ------------------ */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#111827" },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },

  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: { fontWeight: "800", color: "#111827" },
  meta: { color: "#6B7280", marginTop: 4 },
});
