import type { IOrderRepository } from '../ports/IOrderRepository';
// Violates application-layer-boundaries: use case importing a concrete adapter.
import { SqlOrderRepository } from '../../infrastructure/adapters/SqlOrderRepository';

export class PlaceOrderUseCase {
  private readonly repository: IOrderRepository;

  constructor(repository?: IOrderRepository) {
    this.repository = repository ?? new SqlOrderRepository();
  }

  async execute(orderId: string): Promise<void> {
    await this.repository.save({ id: orderId, total: 0 });
  }
}
