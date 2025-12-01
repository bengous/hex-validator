import type { User } from '../../core/domain/User';

/**
 * User repository port - Application layer contract
 * Adapters in infrastructure must implement this interface
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}
