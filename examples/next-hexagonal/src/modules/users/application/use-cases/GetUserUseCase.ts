import type { IUserRepository } from '../ports/IUserRepository';

export class GetUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    return user?.name ?? 'Unknown user';
  }
}
