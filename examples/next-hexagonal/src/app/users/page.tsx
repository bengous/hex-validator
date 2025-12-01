import { getUserName } from '@/modules/users/boundary/actions';

export default async function UsersPage() {
  const name = await getUserName('user-1');

  return <main>{name}</main>;
}
