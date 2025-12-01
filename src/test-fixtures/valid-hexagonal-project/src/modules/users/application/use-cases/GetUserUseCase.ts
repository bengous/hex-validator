import type { User } from '../../core/domain/User';
import type { IUserRepository } from '../ports/IUserRepository';

/**
 * Get user use case - Application layer
 * Depends on port interface, not concrete implementation
 */
export class GetUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }
}
