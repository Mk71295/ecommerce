import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../enums/payment.enums.js';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  order: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: Object.values(PaymentMethod), required: true })
  method: PaymentMethod;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.Pending,
  })
  status: PaymentStatus;

  /**
   * True while the payment is pending or paid. A partial unique index allows only
   * one active payment per order, which prevents double charging.
   */
  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: String })
  transactionId?: string;

  @Prop({ type: String })
  failureReason?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  refundedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index(
  { order: 1 },
  { name: 'one_active_payment_per_order', unique: true, partialFilterExpression: { active: true } },
);
