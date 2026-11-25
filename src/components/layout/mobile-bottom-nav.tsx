'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BOTTOM_ITEMS = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/schedule', label: 'Lịch học', icon: Calendar },
  { href: '/assignments', label: 'Bài tập', icon: ClipboardList },
  { href: '/exams', label: 'Lịch thi', icon: FileText },
] as const;

interface MobileBottomNavProps {
  onOpenMore: () => void;
}

export const MobileBottomNav = memo(function MobileBottomNav({
  onOpenMore,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const isMoreActive = ['/courses', '/notes', '/gpa', '/settings'].some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  return (
    <nav
      aria-label="Điều hướng nhanh trên di động"
      className="lg:hidden print:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/80 bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-16">
        {BOTTOM_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.25]')} />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          aria-label="Mở thêm chức năng"
          className={cn(
            'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95',
            isMoreActive
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid className={cn('h-5 w-5', isMoreActive && 'stroke-[2.25]')} />
          <span>Thêm</span>
        </button>
      </div>
    </nav>
  );
});
