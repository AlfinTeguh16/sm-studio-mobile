export interface Offering {
  id: number;
  name_offer: string;
  price: number;
  makeup_type: string;
  person: number;
}

export interface Booking {
  id: number;
  status: string;
  amount: number;
}

export interface User {
  name: string;
  email: string;
}

export interface Profile {
  role: string;
}