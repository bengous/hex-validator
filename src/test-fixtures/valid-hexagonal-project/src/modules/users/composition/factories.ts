import { GetUserUseCase } from '../application/use-cases/GetUserUseCase';
import { InMemoryUserRepository } from '../infrastructure/adapters/InMemoryUserRepository';

/**
 * Composition root - Wires up dependencies
 * This is the only place where concrete implementations are instantiated
 */
export function createUseCases() {
  const userRepository = new InMemoryUserRepository();

  return {
    getUser: new GetUserUseCase(userRepository),
  };
}
