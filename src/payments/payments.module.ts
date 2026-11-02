import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersModule } from '../orders/orders.module.js';
import { MockPaymentGateway, PaymentGateway } from './gateway/payment-gateway.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    OrdersModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Swap for a real provider implementation when you integrate one.
    { provide: PaymentGateway, useClass: MockPaymentGateway },
  ],
})
export class PaymentsModule {}
