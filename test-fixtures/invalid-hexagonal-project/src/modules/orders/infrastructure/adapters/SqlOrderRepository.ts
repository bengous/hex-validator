import type { Order } from '../../core/domain/Order';
import type { IOrderRepository } from '../../application/ports/IOrderRepository';

export class SqlOrderRepository implements IOrderRepository {
  async save(_order: Order): Promise<void> {}
}
