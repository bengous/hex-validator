'use client';

// Violates no-client-components-to-composition: client component importing composition.
import { createOrderUseCases } from '../modules/orders/composition/factories';

export function CheckoutClient(): null {
  void createOrderUseCases();
  return null;
}
