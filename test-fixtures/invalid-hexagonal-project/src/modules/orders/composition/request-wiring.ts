// Violates composition-layer-boundaries: composition importing boundary.
import { submitOrder } from '../boundary/actions';

export function wireRequest() {
  return submitOrder;
}
