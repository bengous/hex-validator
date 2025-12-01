// Violates core-cross-module-domain-only: core importing another module's ports.
import type { IPaymentGateway } from '../../../payments/application/ports/IPaymentGateway';

export type PaymentCoupling = {
  gateway: IPaymentGateway;
};
