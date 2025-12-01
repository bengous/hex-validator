// Violates not-to-test: production code importing a test file.
import { useCaseUnderTest } from './use-cases/__tests__/PlaceOrderUseCase.test';

export const leakedFromTest = useCaseUnderTest;
