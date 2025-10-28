import { api } from "./api";

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";

export type Booking = {
    id: number;
    customer_id: string;
    mua_id: string;
    offering_id?: number;
    booking_date: string;
    booking_time: string;
    status: BookingStatus;
    job_status?: string;
    offering?: {
        id: number;
        name_offer: string;
        price: number;
    };
    customer?: {
        id: string;
        name: string;
    };
};

export async function getBookings(params: { muaId?: string; customerId?: string; status?: BookingStatus }) {
    return api.get<Booking[]>("/bookings", { params });
}

export async function getBooking(id: number | string) {
    return api.get<Booking>(`/bookings/${id}`);
}

export async function createBooking(data: Partial<Booking>) {
    return api.post<Booking>("/bookings", data);
}

export async function updateBooking(id: number | string, data: Partial<Booking>) {
    return api.put<Booking>(`/bookings/${id}`, data);
}