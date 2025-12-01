import 'server-only';

import type { IUserRepository } from '../../application/ports/IUserRepository';
import type { User } from '../../core/domain/User';

export class MockUserRepository implements IUserRepository {
  constructor(private readonly users: User[] = []) {}

  async findById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }
}
