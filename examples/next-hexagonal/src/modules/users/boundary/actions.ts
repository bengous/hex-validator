'use server';

import { createUseCases } from '../composition/factories';

export async function getUserName(userId: string): Promise<string> {
  const useCases = createUseCases();
  return useCases.getUser.execute(userId);
}
