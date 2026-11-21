import { redirect } from 'next/navigation';
import { getSessionClaims } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in — IamHujju' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const claims = await getSessionClaims();
  if (claims) redirect(params.next ?? (claims.role === 'ADMIN' ? '/admin' : '/playground'));
  return <LoginForm />;
}
