import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../common/enums/role.enum.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { isDuplicateKeyError } from '../common/utils/money.js';
import { toPage } from '../common/utils/paginate.js';
import { OrderStatus } from '../orders/enums/order-status.enum.js';
import type { OrderDocument } from '../orders/schemas/order.schema.js';
import { OrdersService } from '../orders/orders.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentMethod, PaymentStatus } from './enums/payment.enums.js';
import { PaymentGateway } from './gateway/payment-gateway.js';
import { Payment, type PaymentDocument } from './schemas/payment.schema.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    private readonly orders: OrdersService,
    private readonly gateway: PaymentGateway,
  ) {}

  async pay(auth: JwtPayload, dto: CreatePaymentDto): Promise<PaymentDocument> {
    const order = await this.orders.findOneFor(dto.orderId, auth);
    if (order.status !== OrderStatus.Pending) {
      throw new ConflictException('Order is not awaiting payment');
    }

    const payment = await this.createActivePayment(order, dto.method);

    return dto.method === PaymentMethod.Cod
      ? this.payCashOnDelivery(payment, order)
      : this.payOnline(payment, order, dto.token);
  }

  async findMine(userId: string, { page, limit }: PaginationQueryDto) {
    const filter = { user: userId };
    const [data, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return toPage(data, total, page, limit);
  }

  async findOneFor(id: string, auth: JwtPayload): Promise<PaymentDocument> {
    const payment = await this.paymentModel.findById(id).exec();
    const allowed = payment && (auth.role === Role.Admin || payment.user.toString() === auth.sub);
    if (!payment || !allowed) throw new NotFoundException('Payment not found');
    return payment;
  }

  /** Admin: cash was collected on delivery. */
  async confirmCod(id: string): Promise<PaymentDocument> {
    const payment = await this.paymentModel
      .findOneAndUpdate(
        { _id: id, method: PaymentMethod.Cod, status: PaymentStatus.Pending },
        { $set: { status: PaymentStatus.Paid, paidAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!payment) throw new ConflictException('No pending cash-on-delivery payment with this id');
    return payment;
  }

  /** Admin: refund a paid payment. Cancelling the order is a separate step. */
  async refund(id: string): Promise<PaymentDocument> {
    const payment = await this.paymentModel
      .findOne({ _id: id, status: PaymentStatus.Paid })
      .exec();
    if (!payment) throw new ConflictException('No paid payment with this id');

    if (payment.method !== PaymentMethod.Cod && payment.transactionId) {
      await this.gateway.refund(payment.transactionId, payment.amount);
    }
    return this.close(payment, PaymentStatus.Refunded);
  }

  // --- internals -----------------------------------------------------------

  private async createActivePayment(
    order: OrderDocument,
    method: PaymentMethod,
  ): Promise<PaymentDocument> {
    try {
      return await this.paymentModel.create({
        order: order._id,
        user: order.user,
        amount: order.totalPrice,
        method,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictException('A payment for this order is already in progress or completed');
      }
      throw err;
    }
  }

  private async payCashOnDelivery(
    payment: PaymentDocument,
    order: OrderDocument,
  ): Promise<PaymentDocument> {
    try {
      await this.orders.transition(order.id, OrderStatus.Pending, OrderStatus.Processing);
    } catch (err) {
      await this.close(payment, PaymentStatus.Failed, 'Order is no longer payable');
      throw err;
    }
    return payment; // stays "pending" until an admin confirms the cash
  }

  private async payOnline(
    payment: PaymentDocument,
    order: OrderDocument,
    token?: string,
  ): Promise<PaymentDocument> {
    const result = await this.gateway
      .charge({
        amount: payment.amount,
        method: payment.method,
        reference: payment.id,
        token,
      })
      .catch(() => ({ success: false as const, failureReason: 'Payment gateway unavailable' }));

    if (!result.success) {
      await this.close(payment, PaymentStatus.Failed, result.failureReason);
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: 'Payment failed',
          reason: result.failureReason,
          paymentId: payment.id,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    payment.status = PaymentStatus.Paid;
    payment.transactionId = result.transactionId;
    payment.paidAt = new Date();
    await payment.save();

    try {
      await this.orders.transition(order.id, OrderStatus.Pending, OrderStatus.Paid, {
        paidAt: payment.paidAt,
      });
    } catch (err) {
      // The order changed (e.g. cancelled) while we were charging: give the money back.
      await this.gateway.refund(result.transactionId, payment.amount).catch(() => undefined);
      await this.close(payment, PaymentStatus.Refunded);
      throw err;
    }
    return payment;
  }

  private close(
    payment: PaymentDocument,
    status: PaymentStatus.Failed | PaymentStatus.Refunded,
    failureReason?: string,
  ): Promise<PaymentDocument> {
    payment.status = status;
    payment.active = false;
    if (failureReason) payment.failureReason = failureReason;
    if (status === PaymentStatus.Refunded) payment.refundedAt = new Date();
    return payment.save();
  }
}
