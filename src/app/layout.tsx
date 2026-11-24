import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toast';
import { auth } from '@/lib/auth';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#080c17' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'WebSchedule - Quản lý lịch học thông minh',
    template: '%s | WebSchedule',
  },
  description:
    'Nền tảng quản lý thời khóa biểu, môn học, bài tập, lịch thi và ghi chú buổi học trực quan dành cho sinh viên.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={inter.className}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-elevated"
        >
          Chuyển đến nội dung chính
        </a>
        <Providers session={session}>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
