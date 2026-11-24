import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/app-layout';

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return <AppLayout>{children}</AppLayout>;
}
