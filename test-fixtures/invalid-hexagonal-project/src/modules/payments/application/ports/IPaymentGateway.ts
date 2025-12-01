import type { Payment } from '../../core/domain/Payment';

export interface IPaymentGateway {
  charge(payment: Payment): Promise<void>;
}
