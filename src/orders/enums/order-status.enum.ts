export enum OrderStatus {
  Pending = 'pending', // created, waiting for payment
  Paid = 'paid',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}
