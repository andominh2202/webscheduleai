'use client';

import { useEffect, useRef } from 'react';
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';

interface ProvidersProps {
  children: React.ReactNode;
  session?: Session | null;
}

export function Providers({ children, session }: ProvidersProps) {
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    // 1. Register minimal PWA service worker in production so mobile browsers enable "Install App"
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      } else {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              registration.unregister().catch(() => {});
            }
          })
          .catch(() => {});
      }
    }

    // 2. Debounce rapid repeated F5 / Ctrl+R to avoid spamming page reloads and browser freezes
    const handleKeyDown = (e: KeyboardEvent) => {
      const isReload =
        e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'));

      if (!isReload) return;

      const now = Date.now();
      let lastSessionReload = 0;
      try {
        lastSessionReload = Number(sessionStorage.getItem('__ws_last_reload') || '0');
      } catch {
        // ignore storage restrictions
      }
      const diffKey = now - lastKeyTimeRef.current;
      const diffSession = now - lastSessionReload;
      lastKeyTimeRef.current = now;

      if (diffKey < 1200 || diffSession < 1200) {
        e.preventDefault();
        e.stopPropagation();
        toast.info('Trang vừa được tải, vui lòng không nhấn F5 quá nhanh.');
        return;
      }

      try {
        sessionStorage.setItem('__ws_last_reload', String(now));
      } catch {
        // ignore storage restrictions
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
