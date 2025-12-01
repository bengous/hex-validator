// Violates boundary-layer-boundaries: boundary importing infrastructure directly.
import { SqlOrderRepository } from '../infrastructure/adapters/SqlOrderRepository';

export async function submitOrder(orderId: string): Promise<void> {
  await new SqlOrderRepository().save({ id: orderId, total: 0 });
}
