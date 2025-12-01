import { describe, expect, it } from 'vitest';
import { MockUserRepository } from '../../../infrastructure/mocks/MockUserRepository';

describe('IUserRepository contract', () => {
  it('returns a user by id when the user exists', async () => {
    const repository = new MockUserRepository([
      { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    ]);

    await expect(repository.findById('user-1')).resolves.toEqual({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });
});
