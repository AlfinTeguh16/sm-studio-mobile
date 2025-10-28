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
import { api } from "../../../../lib/api";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

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
    let alive = true;
    (async () => {
      try {
        const response = await api.me();
        if (alive && response) {
          const pid = response.profile?.id || response.id;
          if (pid) setMuaId(String(pid));
        }
      } catch (error) {
        console.warn("Error fetching user profile:", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

  // Hanya gunakan endpoint query
  // Gunakan endpoint /offerings/mine sesuai backend
  const fetchOfferings = async () => {
    return api.offerings.mine();
  };

  const loadInitial = useCallback(async () => {
    if (!muaId) return;
    setLoading(true);
    setErrorText(null);
    try {
      const res = await fetchOfferings();
      console.log('[Offerings] API response:', res);
      const { list, next } = mapRows(res);
      setRows(list);
      setNextUrl(next);
    } catch (e: any) {
      console.error('[Offerings] Error:', e);
      setRows([]);
      setNextUrl(null);
      setErrorText(e?.message || "Gagal memuat offerings.");
    } finally {
      setLoading(false);
    }
  }, [muaId]);

  const loadMore = useCallback(async () => {
    if (!nextUrl) return;
    try {
      // Since we're using the mine() endpoint, we need to implement pagination on the server first
      console.log('Pagination not yet implemented');
    } catch (error) {
      console.error('Error loading more offerings:', error);
    }
  }, [nextUrl]);

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
