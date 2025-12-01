import type { Order } from '../../core/domain/Order';

export interface IOrderRepository {
  save(order: Order): Promise<void>;
}
