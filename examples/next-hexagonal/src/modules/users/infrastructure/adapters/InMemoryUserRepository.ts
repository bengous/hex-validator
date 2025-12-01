import 'server-only';

import type { IUserRepository } from '../../application/ports/IUserRepository';
import type { User } from '../../core/domain/User';

export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, User>([
    ['user-1', { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' }],
  ]);

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
}
