// Violates no-circular together with CycleB.ts.
import { cycleB } from './CycleB';

export function cycleA(): number {
  return cycleB();
}
