import { getAuthToken } from "../utils/authStorage";

const API_BASE_URL = "https://smstudio.my.id/api";

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Log detail request
  // Pastikan tidak ada double slash
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;
  console.log('[API] Request:', {
    url,
    method: options.method || 'GET',
    headers,
    body: options.body || null,
  });

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.text().then(text => {
      try {
        return JSON.parse(text);
      } catch {
        return { message: text };
      }
    });

    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.text().then(text => {
        try {
          return JSON.parse(text);
        } catch {
          return { message: text };
        }
      });
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async me() {
    return fetchWithAuth("/auth/me");
  },

  // Generic HTTP methods
  async get<T>(endpoint: string, options: { params?: Record<string, any> } = {}) {
    const url = new URL(API_BASE_URL + (endpoint.startsWith("/") ? endpoint : "/" + endpoint));
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }
    // Ambil path setelah /api -> hapus prefiks '/api'
    const path = (url.pathname + url.search).replace(/^\/api/, "");
    return fetchWithAuth(path);
  },


  async post<T>(endpoint: string, data: any) {
    return fetchWithAuth(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async put<T>(endpoint: string, data: any) {
    return fetchWithAuth(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async delete(endpoint: string, options: { params?: { only_read?: boolean } } = {}) {
    return fetchWithAuth(endpoint, {
      method: "DELETE",
    });
  },

  // Resources
  offerings: {
    list(params?: { muaId?: string; per_page?: number }) {
      return api.get("/offerings", { params });
    },
    mine(params?: { per_page?: number }) {
      return api.get("/offerings/mine", { params });
    },
    get(id: number | string) {
      return api.get(`/offerings/${id}`);
    },
    create(data: any) {
      return api.post("/offerings", data);
    },
    update(id: number | string, data: any) {
      return api.put(`/offerings/${id}`, data);
    },
    delete(id: number | string) {
      return api.delete(`/offerings/${id}`);
    },
  },

  bookings: {
    list(params?: { mua_id?: string; customer_id?: string; status?: string; per_page?: number }) {
      return api.get("/bookings", { params });
    },
    mine(params?: { status?: string; per_page?: number }) {
      return api.get("/bookings/mine", { params });
    },
    get(id: number | string) {
      return api.get(`/bookings/${id}`);
    },
    create(data: any) {
      return api.post("/bookings", data);
    },
    update(id: number | string, data: any) {
      return api.put(`/bookings/${id}`, data);
    },
    delete(id: number | string) {
      return api.delete(`/bookings/${id}`);
    },
    respondToInvite(bookingId: string | number, action: "accept" | "decline") {
      return api.post(`/bookings/${bookingId}/collaborators/respond`, { action });
    }
  },

  notifications: {
    list(params?: { per_page?: number; page?: number }) {
      return api.get("/notifications", { params });
    },
    mine(params?: { per_page?: number; page?: number }) {
      return api.get("/notifications/mine", { params });
    },
    get(id: number | string) {
      return api.get(`/notifications/${id}`);
    },
    getUnreadCount() {
      return api.get("/notifications/unread-count");
    },
    markAsRead(id: number | string) {
      return api.post(`/notifications/${id}/read`, {});
    },
    markAllAsRead() {
      return api.post("/notifications/read-all", {});
    },
    clearRead() {
      return api.delete("/notifications", { params: { only_read: true } });
    },
    delete(id: number | string) {
      return api.delete(`/notifications/${id}`);
    }
  },

  portfolio: {
    list(params?: { muaId?: string; per_page?: number }) {
      return api.get("/portfolio", { params });
    },
    mine(params?: { per_page?: number }) {
      return api.get("/portfolio/mine", { params });
    },
    get(id: number | string) {
      return api.get(`/portfolio/${id}`);
    },
    create(data: FormData) {
      return fetchWithAuth("/portfolio", {
        method: "POST",
        body: data,
        headers: {}, // Let browser set content-type for FormData
      });
    },
    update(id: number | string, data: FormData) {
      return fetchWithAuth(`/portfolio/${id}`, {
        method: "PUT",
        body: data,
        headers: {}, // Let browser set content-type for FormData
      });
    },
    delete(id: number | string) {
      return api.delete(`/portfolio/${id}`);
    }
  },

  profile: {
    update(data: FormData) {
      return fetchWithAuth("/profile", {
        method: "PUT",
        body: data,
        headers: {}, // Let browser set content-type for FormData
      });
    },
    updateLocation(data: { latitude: number; longitude: number }) {
      return api.put("/profile/location", data);
    }
  }
};