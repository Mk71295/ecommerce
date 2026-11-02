export enum PaymentMethod {
  Cod = 'cod', // cash on delivery
  Card = 'card',
  Wallet = 'wallet',
}

export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Refunded = 'refunded',
}
