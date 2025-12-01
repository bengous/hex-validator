// Violates ui-layer-boundaries: module ui importing application directly.
import { PlaceOrderUseCase } from '../application/use-cases/PlaceOrderUseCase';

export function orderWidget(): PlaceOrderUseCase {
  return new PlaceOrderUseCase();
}
