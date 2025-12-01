// Violates app-shell-domain-types-only: runtime (non type-only) import of core code.
import { orderTotal } from '../modules/orders/core/domain/Order';

export function pageTotal(): number {
  return orderTotal({ id: 'order-1', total: 0 });
}
