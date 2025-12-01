import type { Order } from '../../core/domain/Order';
import type { IOrderRepository } from '../../application/ports/IOrderRepository';
// Violates infrastructure-layer-boundaries: adapter importing composition wiring.
import { createOrderUseCases } from '../../composition/factories';

export class TelemetryAdapter implements IOrderRepository {
  async save(order: Order): Promise<void> {
    await createOrderUseCases().placeOrder.execute(order.id);
  }
}
