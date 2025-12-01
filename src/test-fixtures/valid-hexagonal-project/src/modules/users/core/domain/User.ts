/**
 * User entity - Core domain model
 * This file lives in core/domain as per hexagonal architecture
 */
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface CreateUserParams {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export function createUser(params: CreateUserParams): User {
  return {
    id: params.id,
    email: params.email,
    name: params.name,
    createdAt: params.createdAt,
  };
}
