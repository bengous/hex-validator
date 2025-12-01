import { PlaceOrderUseCase } from '../application/use-cases/PlaceOrderUseCase';

export function createOrderUseCases() {
  return {
    placeOrder: new PlaceOrderUseCase(),
  };
}
