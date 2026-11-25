'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { PwaInstallBanner } from './pwa-install-banner';

const SIDEBAR_STORAGE_KEY = '__ws_sidebar_collapsed';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydrate persisted sidebar collapsed state safely on client
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved === '1') {
        setSidebarCollapsed(true);
      }
    } catch {
      // ignore storage restrictions
    }
  }, []);

  // Close mobile drawer automatically on route navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll & support Escape key when mobile navigation drawer is open
  useEffect(() => {
    if (!mobileOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  }, []);

  const handleMobileOpen = useCallback(() => {
    setMobileOpen(true);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin-left] duration-200 ease-out print:!ml-0',
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[256px]'
        )}
      >
        <Topbar onMobileMenuClick={handleMobileOpen} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-[1600px] mx-auto p-4 pb-24 sm:p-5 sm:pb-24 md:p-6 lg:pb-6 focus:outline-none"
        >
          <PwaInstallBanner />
          <div key={pathname} className="page-transition">
            {children}
          </div>
        </main>
        <MobileBottomNav onOpenMore={handleMobileOpen} />
      </div>
    </div>
  );
}
