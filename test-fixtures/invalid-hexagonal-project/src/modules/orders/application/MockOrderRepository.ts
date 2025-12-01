// Violates mocks-live-in-infrastructure-mocks: mock outside infrastructure/mocks/.
import type { Order } from '../core/domain/Order';
import type { IOrderRepository } from './ports/IOrderRepository';

export class MockOrderRepository implements IOrderRepository {
  async save(_order: Order): Promise<void> {}
}
