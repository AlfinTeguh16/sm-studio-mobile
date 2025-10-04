// Dummy API mock
export const api = {
  async login() {
    return { token: 'dummy-token', user: { name: 'Jennifer M', email: 'jennifer@example.com' }, profile: { role: 'customer' } };
  },
  async offerings() {
    return [
      { id: 1, name_offer: 'Wedding Package', price: 1000000, makeup_type: 'bridal', person: 1 },
      { id: 2, name_offer: 'Graduation Package', price: 300000, makeup_type: 'graduation', person: 1 },
    ];
  },
  async createBooking() {
    return { id: 1, status: 'pending', amount: 1000000 };
  },
};