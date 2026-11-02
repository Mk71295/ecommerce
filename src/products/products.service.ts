import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, type Types } from 'mongoose';
import { toPage } from '../common/utils/paginate.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { Product, type ProductDocument } from './schemas/product.schema.js';

export interface StockItem {
  productId: string;
  quantity: number;
}

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  create(dto: CreateProductDto): Promise<ProductDocument> {
    return this.productModel.create(dto);
  }

  async findAll(query: ListProductsQueryDto) {
    const { page, limit, search, category, minPrice, maxPrice, sort } = query;

    const filter: QueryFilter<Product> = { isActive: true };
    if (search) filter.$text = { $search: search };
    if (category) filter.category = category;
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {
        ...(minPrice !== undefined && { $gte: minPrice }),
        ...(maxPrice !== undefined && { $lte: maxPrice }),
      };
    }

    const sortBy: Record<string, 1 | -1> = sort.startsWith('-')
      ? { [sort.slice(1)]: -1 }
      : { [sort]: 1 };

    const [data, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);
    return toPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findActiveOrFail(id: string): Promise<ProductDocument> {
    const product = await this.findOne(id);
    if (!product.isActive) throw new BadRequestException('Product is not available');
    return product;
  }

  findManyByIds(ids: Array<string | Types.ObjectId>): Promise<ProductDocument[]> {
    return this.productModel.find({ _id: { $in: ids } }).exec();
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.productModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Soft delete, so past orders and carts keep resolving. */
  async remove(id: string): Promise<void> {
    const product = await this.productModel
      .findByIdAndUpdate(id, { isActive: false })
      .exec();
    if (!product) throw new NotFoundException('Product not found');
  }

  /**
   * Atomically takes stock for every item. Each decrement only succeeds if enough
   * stock remains, so concurrent checkouts can never oversell. If any item fails,
   * everything already taken is put back. (Works on a standalone MongoDB; no
   * replica set / transactions required.)
   */
  async reserveStock(items: StockItem[]): Promise<void> {
    const reserved: StockItem[] = [];
    try {
      for (const item of items) {
        const result = await this.productModel.updateOne(
          { _id: item.productId, isActive: true, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
        );
        if (result.modifiedCount !== 1) {
          throw new ConflictException(
            `Not enough stock for product ${item.productId}`,
          );
        }
        reserved.push(item);
      }
    } catch (err) {
      await this.releaseStock(reserved);
      throw err;
    }
  }

  async releaseStock(items: StockItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.productModel.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { stock: item.quantity } },
        },
      })),
    );
  }
}
