// Violates app-shell-layer-boundaries: route importing infrastructure directly.
import { SqlOrderRepository } from '../modules/orders/infrastructure/adapters/SqlOrderRepository';

export default async function OrdersPage(): Promise<string> {
  await new SqlOrderRepository().save({ id: 'order-1', total: 0 });
  return 'orders';
}
