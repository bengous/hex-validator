import type { User } from '../../core/domain/User';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
}
