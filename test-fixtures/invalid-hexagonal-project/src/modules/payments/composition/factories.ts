import type { IPaymentGateway } from '../application/ports/IPaymentGateway';
import { ChargeUseCase } from '../application/use-cases/ChargeUseCase';
import { PlaceOrderUseCase } from '../../orders/application/use-cases/PlaceOrderUseCase';

export function createPaymentUseCases(gateway: IPaymentGateway) {
  return {
    charge: new ChargeUseCase(gateway, new PlaceOrderUseCase()),
  };
}
