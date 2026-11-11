'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          'transition-all duration-300 print:!ml-0',
          sidebarCollapsed ? 'lg:ml-[70px]' : 'lg:ml-[250px]'
        )}
      >
        <Topbar onMobileMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 md:p-6 max-w-[1600px] mx-auto">{children}</main>
      </div>
    </div>
  );
}

