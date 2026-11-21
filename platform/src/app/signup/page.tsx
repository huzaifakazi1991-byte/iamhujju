import { redirect } from 'next/navigation';
import { getSessionClaims } from '@/lib/session';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create account — IamHujju' };

export default async function SignupPage() {
  const claims = await getSessionClaims();
  if (claims) redirect('/playground');
  return <SignupForm />;
}
