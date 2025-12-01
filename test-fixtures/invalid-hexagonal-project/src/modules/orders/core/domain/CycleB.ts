// Violates no-circular together with CycleA.ts.
import { cycleA } from './CycleA';

export function cycleB(): number {
  return cycleA();
}
