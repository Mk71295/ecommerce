import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter } from 'mongoose';
import { CartService } from '../cart/cart.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { round2 } from '../common/utils/money.js';
import { toPage } from '../common/utils/paginate.js';
import { ProductsService, type StockItem } from '../products/products.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersQueryDto } from './dto/order-queries.dto.js';
import { OrderStatus } from './enums/order-status.enum.js';
import { Order, type OrderDocument } from './schemas/order.schema.js';

type TimestampPatch = Partial<Pick<Order, 'paidAt' | 'deliveredAt' | 'cancelledAt'>>;

/** What an admin may do by hand. pending→paid/processing only happens through payments. */
const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]: [OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.Processing]: [OrderStatus.Shipped, OrderStatus.Cancelled],
  [OrderStatus.Shipped]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly cart: CartService,
    private readonly products: ProductsService,
  ) {}

  /** Checkout: cart → order. Reserves stock first, rolls it back if anything fails. */
  async createFromCart(userId: string, dto: CreateOrderDto): Promise<OrderDocument> {
    const lines = await this.cart.resolveCheckoutLines(userId);
    const stockItems: StockItem[] = lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
    }));

    await this.products.reserveStock(stockItems);

    try {
      const order = await this.orderModel.create({
        user: userId,
        items: lines.map((l) => ({
          product: l.productId,
          name: l.name,
          price: l.price,
          quantity: l.quantity,
        })),
        totalPrice: round2(lines.reduce((sum, l) => sum + l.price * l.quantity, 0)),
        shippingAddress: dto.shippingAddress,
      });
      await this.cart.clear(userId);
      return order;
    } catch (err) {
      await this.products.releaseStock(stockItems);
      throw err;
    }
  }

  async findMine(userId: string, query: ListOrdersQueryDto) {
    return this.list({ user: userId, ...(query.status && { status: query.status }) }, query);
  }

  async findAll(query: ListOrdersQueryDto) {
    return this.list(query.status ? { status: query.status } : {}, query);
  }

  /** Owner or admin. Other users get a 404 so order ids can't be probed. */
  async findOneFor(id: string, auth: JwtPayload): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    const allowed = order && (auth.role === Role.Admin || order.user.toString() === auth.sub);
    if (!order || !allowed) throw new NotFoundException('Order not found');
    return order;
  }

  /** Customers can cancel their own order only while it is still unpaid. */
  async cancel(id: string, auth: JwtPayload): Promise<OrderDocument> {
    const order = await this.findOneFor(id, auth);
    if (order.status !== OrderStatus.Pending) {
      throw new ConflictException('Only unpaid pending orders can be cancelled');
    }
    const cancelled = await this.transition(id, OrderStatus.Pending, OrderStatus.Cancelled, {
      cancelledAt: new Date(),
    });
    await this.products.releaseStock(this.toStockItems(cancelled));
    return cancelled;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (!ADMIN_TRANSITIONS[order.status].includes(status)) {
      throw new BadRequestException(`Cannot move an order from ${order.status} to ${status}`);
    }

    const patch: TimestampPatch =
      status === OrderStatus.Delivered
        ? { deliveredAt: new Date() }
        : status === OrderStatus.Cancelled
          ? { cancelledAt: new Date() }
          : {};

    const updated = await this.transition(id, order.status, status, patch);
    if (status === OrderStatus.Cancelled) {
      await this.products.releaseStock(this.toStockItems(updated));
    }
    return updated;
  }

  /**
   * Atomic compare-and-set on status. Also used by PaymentsService.
   * Fails with 409 if the order is no longer in one of the `from` states.
   */
  async transition(
    id: string,
    from: OrderStatus | OrderStatus[],
    to: OrderStatus,
    patch: TimestampPatch = {},
  ): Promise<OrderDocument> {
    const order = await this.orderModel
      .findOneAndUpdate(
        { _id: id, status: { $in: Array.isArray(from) ? from : [from] } },
        { $set: { status: to, ...patch } },
        { new: true },
      )
      .exec();
    if (!order) {
      throw new ConflictException(`Order can no longer be moved to "${to}"`);
    }
    return order;
  }

  private async list(filter: QueryFilter<Order>, { page, limit }: ListOrdersQueryDto) {
    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return toPage(data, total, page, limit);
  }

  private toStockItems(order: OrderDocument): StockItem[] {
    return order.items.map((i) => ({ productId: i.product.toString(), quantity: i.quantity }));
  }
}
