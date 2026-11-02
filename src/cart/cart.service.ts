import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { round2 } from '../common/utils/money.js';
import type { ProductDocument } from '../products/schemas/product.schema.js';
import { ProductsService } from '../products/products.service.js';
import type { AddCartItemDto } from './dto/cart-item.dto.js';
import { Cart, type CartDocument, type CartItem } from './schemas/cart.schema.js';

export interface CheckoutLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<Cart>,
    private readonly products: ProductsService,
  ) {}

  async getCart(userId: string) {
    return this.toView(await this.getOrCreate(userId));
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.products.findActiveOrFail(dto.productId);
    const cart = await this.getOrCreate(userId);

    const existing = cart.items.find((i) => i.product.equals(dto.productId));
    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    this.assertStock(product, quantity);

    if (existing) existing.quantity = quantity;
    else cart.items.push({ product: product._id, quantity });

    await cart.save();
    return this.toView(cart);
  }

  async updateItem(userId: string, productId: string, quantity: number) {
    const product = await this.products.findActiveOrFail(productId);
    const cart = await this.getOrCreate(userId);

    const item = cart.items.find((i) => i.product.equals(productId));
    if (!item) throw new NotFoundException('Item is not in the cart');
    this.assertStock(product, quantity);

    item.quantity = quantity;
    await cart.save();
    return this.toView(cart);
  }

  async removeItem(userId: string, productId: string) {
    await this.getOrCreate(userId);
    const cart = await this.cartModel
      .findOneAndUpdate(
        { user: userId },
        { $pull: { items: { product: productId } } },
        { new: true },
      )
      .orFail()
      .exec();
    return this.toView(cart);
  }

  async clear(userId: string): Promise<void> {
    await this.cartModel.updateOne({ user: userId }, { $set: { items: [] } }).exec();
  }

  /** Turns the cart into priced order lines, using current product data. */
  async resolveCheckoutLines(userId: string): Promise<CheckoutLine[]> {
    const cart = await this.cartModel.findOne({ user: userId }).exec();
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const products = await this.products.findManyByIds(cart.items.map((i) => i.product));
    const byId = new Map(products.map((p) => [p.id, p]));

    return cart.items.map((item) => {
      const product = byId.get(item.product.toString());
      if (!product || !product.isActive) {
        throw new BadRequestException(
          'A product in your cart is no longer available. Remove it and try again.',
        );
      }
      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
      };
    });
  }

  private getOrCreate(userId: string): Promise<CartDocument> {
    return this.cartModel
      .findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { items: [] } },
        { upsert: true, new: true },
      )
      .orFail()
      .exec();
  }

  private assertStock(product: ProductDocument, quantity: number): void {
    if (product.stock < quantity) {
      throw new BadRequestException(
        `Only ${product.stock} of "${product.name}" left in stock`,
      );
    }
  }

  private async toView(cart: { items: CartItem[] }) {
    const products = await this.products.findManyByIds(cart.items.map((i) => i.product));
    const byId = new Map(products.map((p) => [p.id, p]));

    const items = cart.items.map((item) => {
      const product = byId.get(item.product.toString());
      const active = !!product?.isActive;
      return {
        productId: item.product.toString(),
        name: product?.name ?? null,
        price: product?.price ?? null,
        quantity: item.quantity,
        lineTotal: active ? round2(product.price * item.quantity) : 0,
        available: active && product.stock >= item.quantity,
      };
    });

    return {
      items,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      total: round2(items.reduce((sum, i) => sum + i.lineTotal, 0)),
    };
  }
}
