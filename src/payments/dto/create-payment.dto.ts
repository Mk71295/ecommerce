import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '../enums/payment.enums.js';

export class CreatePaymentDto {
  @IsMongoId()
  orderId: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Provider token for card / wallet payments. */
  @IsOptional()
  @IsString()
  token?: string;
}
