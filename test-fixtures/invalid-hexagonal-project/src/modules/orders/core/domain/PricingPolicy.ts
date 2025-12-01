// Violates core-must-be-pure: core importing application, even type-only.
import type { PlaceOrderUseCase } from '../../application/use-cases/PlaceOrderUseCase';

export type PricingPolicy = {
  useCase: PlaceOrderUseCase;
};
