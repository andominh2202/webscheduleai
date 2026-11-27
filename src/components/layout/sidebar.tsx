'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  StickyNote,
  ClipboardList,
  FileText,
  Calculator,
  Settings,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const navGroups = [
  {
    label: 'Học tập',
    items: [
      { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      { href: '/schedule', label: 'Thời khóa biểu', icon: Calendar },
      { href: '/courses', label: 'Môn học', icon: BookOpen },
      { href: '/notes', label: 'Ghi chú', icon: StickyNote },
    ],
  },
  {
    label: 'Theo dõi',
    items: [
      { href: '/assignments', label: 'Bài tập', icon: ClipboardList },
      { href: '/exams', label: 'Lịch thi', icon: FileText },
      { href: '/gpa', label: 'Tính GPA', icon: Calculator },
    ],
  },
  {
    label: 'Hệ thống',
    items: [{ href: '/settings', label: 'Cài đặt', icon: Settings }],
  },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = memo(function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const userInitial =
    session?.user?.name?.[0]?.toUpperCase() ||
    session?.user?.email?.[0]?.toUpperCase() ||
    'U';

  const desktopCollapsed = collapsed && !mobileOpen;

  return (
    <>
      {/* Mobile backdrop overlay */}
      <div
        aria-hidden="true"
        onClick={onMobileClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      <aside
        aria-label="Thanh điều hướng chính"
        className={cn(
          'fixed top-0 left-0 z-50 lg:z-40 h-screen bg-card border-r border-border/85 flex flex-col shadow-elevated lg:shadow-none transition-[width,transform] duration-200 ease-out',
          'w-[272px] max-w-[85vw]',
          collapsed ? 'lg:w-[72px]' : 'lg:w-[256px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand header */}
        <div
          className={cn(
            'flex items-center justify-between h-14 border-b border-border/80 px-4',
            desktopCollapsed && 'lg:justify-center lg:px-2'
          )}
        >
          <Link
            href="/dashboard"
            onClick={onMobileClose}
            className="flex items-center gap-3 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandLogo size={36} className="w-9 h-9" />
            {!desktopCollapsed && (
              <div className="min-w-0">
                <span className="block text-base font-bold tracking-tight text-foreground truncate">
                  WebSchedule
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  Quản lý học tập
                </span>
              </div>
            )}
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onMobileClose}
            aria-label="Đóng menu điều hướng"
            className="lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Navigation links */}
        <nav
          aria-label="Danh mục trang"
          className="flex-1 py-3 px-2.5 space-y-3 overflow-y-auto"
        >
          {navGroups.map((group, groupIdx) => (
            <div key={group.label} className="space-y-1">
              {!desktopCollapsed ? (
                <p className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/75 select-none">
                  {group.label}
                </p>
              ) : (
                groupIdx > 0 && <Separator className="my-1.5 mx-auto w-6" />
              )}
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;

                const linkElement = (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={onMobileClose}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={desktopCollapsed ? item.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      desktopCollapsed && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-blue-400 font-semibold'
                        : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary"
                      />
                    )}
                    <Icon
                      className={cn(
                        'w-[18px] h-[18px] flex-shrink-0 transition-transform duration-150 group-hover:scale-105 motion-reduce:group-hover:scale-100',
                        isActive
                          ? 'text-primary dark:text-blue-400'
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {!desktopCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );

                if (desktopCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkElement;
              })}
            </div>
          ))}
        </nav>

        <Separator />

        {/* Footer controls */}
        <div className="p-2.5 space-y-1.5">
          {/* Theme switch */}
          {(() => {
            const themeLabel = isDark ? 'Chế độ sáng' : 'Chế độ tối';
            const themeBtn = (
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent/80 hover:text-foreground transition-colors w-full',
                  desktopCollapsed && 'lg:justify-center lg:px-0'
                )}
              >
                {isDark ? (
                  <Sun className="w-[18px] h-[18px] flex-shrink-0 text-amber-500" />
                ) : (
                  <Moon className="w-[18px] h-[18px] flex-shrink-0" />
                )}
                {!desktopCollapsed && (
                  <span className="truncate">{mounted ? themeLabel : 'Giao diện'}</span>
                )}
              </button>
            );

            if (desktopCollapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{themeBtn}</TooltipTrigger>
                  <TooltipContent side="right">{themeLabel}</TooltipContent>
                </Tooltip>
              );
            }
            return themeBtn;
          })()}

          {/* User summary */}
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl bg-muted/45 px-2.5 py-2 border border-border/50',
              desktopCollapsed && 'lg:justify-center lg:px-1.5 lg:bg-transparent lg:border-transparent'
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="w-8 h-8 flex-shrink-0 ring-1 ring-border">
                  <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary dark:text-blue-400">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              {desktopCollapsed && (
                <TooltipContent side="right">
                  <p className="font-medium">{session?.user?.name || 'Sinh viên'}</p>
                  {session?.user?.email && (
                    <p className="text-xs text-muted-foreground">{session.user.email}</p>
                  )}
                </TooltipContent>
              )}
            </Tooltip>

            {!desktopCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {session?.user?.name || 'Sinh viên'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {session?.user?.email}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Đăng xuất"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setLogoutConfirmOpen(true)}
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Đăng xuất</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* Desktop collapse button */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          aria-expanded={!collapsed}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full border border-border bg-card text-muted-foreground items-center justify-center shadow-card hover:bg-accent hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </aside>

      <ConfirmDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title="Xác nhận đăng xuất"
        description="Bạn có chắc chắn muốn đăng xuất khỏi tài khoản hiện tại không?"
        confirmLabel="Đăng xuất"
        cancelLabel="Ở lại"
        variant="destructive"
        onConfirm={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  );
});

export const MobileMenuButton = memo(function MobileMenuButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Mở menu điều hướng"
      className="lg:hidden h-9 w-9 flex-shrink-0"
      onClick={onClick}
    >
      <Menu className="w-5 h-5" />
    </Button>
  );
});
