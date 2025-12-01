import type { IPaymentGateway } from '../ports/IPaymentGateway';
// Violates no-cross-module-internals: importing another module's use case.
import { PlaceOrderUseCase } from '../../../orders/application/use-cases/PlaceOrderUseCase';

export class ChargeUseCase {
  constructor(
    private readonly gateway: IPaymentGateway,
    private readonly placeOrder: PlaceOrderUseCase
  ) {}

  async execute(paymentId: string): Promise<void> {
    await this.gateway.charge({ id: paymentId, amount: 0 });
    await this.placeOrder.execute(paymentId);
  }
}
