import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default function HomePage() {
  const cookieStore = cookies();
  const token = cookieStore.get('token');

  if (token) {
    redirect('/feed');
  }

  redirect('/login');
}
