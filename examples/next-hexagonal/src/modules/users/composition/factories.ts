import 'server-only';

import { GetUserUseCase } from '../application/use-cases/GetUserUseCase';
import { InMemoryUserRepository } from '../infrastructure/adapters/InMemoryUserRepository';

export function createUseCases() {
  const userRepository = new InMemoryUserRepository();

  return {
    getUser: new GetUserUseCase(userRepository),
  };
}
