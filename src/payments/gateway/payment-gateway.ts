import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PaymentMethod } from '../enums/payment.enums.js';

export interface ChargeInput {
  amount: number;
  method: PaymentMethod;
  /** Your own reference, e.g. the payment id. */
  reference: string;
  /** Token from the provider's client SDK (never raw card data). */
  token?: string;
}

export type ChargeResult =
  | { success: true; transactionId: string }
  | { success: false; failureReason: string };

/**
 * The seam for a real provider (Paymob, Stripe, Fawry, ...). Implement this
 * and swap the provider in PaymentsModule; nothing else needs to change.
 */
export abstract class PaymentGateway {
  abstract charge(input: ChargeInput): Promise<ChargeResult>;
  abstract refund(transactionId: string, amount: number): Promise<void>;
}

/** Development gateway: approves everything except the token "tok_declined". */
@Injectable()
export class MockPaymentGateway extends PaymentGateway {
  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (input.token === 'tok_declined') {
      return { success: false, failureReason: 'Card declined' };
    }
    return { success: true, transactionId: `mock_${randomUUID()}` };
  }

  async refund(): Promise<void> {
    // nothing to do for the mock
  }
}
