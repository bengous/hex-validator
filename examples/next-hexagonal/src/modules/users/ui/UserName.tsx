import type { UserView } from '../boundary/types';

export function UserName({ user }: { user: UserView }) {
  return <span>{user.name}</span>;
}
