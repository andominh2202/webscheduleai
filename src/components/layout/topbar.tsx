'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  Bell,
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  StickyNote,
  Sun,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { cn, formatShortDate } from '@/lib/utils';
import { getCached, setCached, invalidateCache } from '@/lib/client-cache';
import { MobileMenuButton } from './sidebar';

interface Semester {
  id: string;
  name: string;
  isActive: boolean;
}

interface SearchResults {
  courses: { id: string; name: string; courseCode: string; color: string }[];
  notes: {
    id: string;
    date: string;
    content?: string | null;
    course: { name: string; color: string };
  }[];
  assignments: { id: string; title: string; dueDate: string; course: { name: string } }[];
  exams: { id: string; title: string; date: string; course: { name: string } }[];
}

interface NotificationItem {
  id: string;
  kind: 'session' | 'assignment_overdue' | 'assignment_upcoming' | 'exam';
  title: string;
  subtitle: string;
  href: string;
  time: string;
  urgent: boolean;
  color?: string;
}

interface TopbarProps {
  onMobileMenuClick: () => void;
}

export const Topbar = memo(function Topbar({ onMobileMenuClick }: TopbarProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const cachedSemesters = getCached<Semester[]>('/api/semesters');
  const [semesters, setSemesters] = useState<Semester[]>(() => cachedSemesters || []);
  const [activeSemester, setActiveSemester] = useState<string>(() => {
    if (cachedSemesters && cachedSemesters.length > 0) {
      const active = cachedSemesters.find((s) => s.isActive);
      return active ? active.id : cachedSemesters[0].id;
    }
    return '';
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortSearchRef = useRef<AbortController | null>(null);

  // Notifications state
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [urgentCount, setUrgentCount] = useState(0);
  const [browserNotifyEnabled, setBrowserNotifyEnabled] = useState(false);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const fetchingNotificationsRef = useRef(false);
  const abortSemestersRef = useRef<AbortController | null>(null);
  const abortNotificationsRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserNotifyEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K for quick search, Escape to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 640) {
          setMobileSearchOpen(true);
          setTimeout(() => mobileSearchInputRef.current?.focus(), 20);
        } else {
          searchInputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchSemesters = useCallback(async () => {
    abortSemestersRef.current?.abort();
    abortSemestersRef.current = new AbortController();

    try {
      const res = await fetch('/api/semesters', {
        signal: abortSemestersRef.current.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const list: Semester[] = Array.isArray(data) ? data : [];
        setSemesters(list);
        setCached('/api/semesters', list);
        const active = list.find((s: Semester) => s.isActive);
        if (active) setActiveSemester(active.id);
        else if (list.length > 0) setActiveSemester(list[0].id);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        // ignore network error
      }
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (fetchingNotificationsRef.current) return;
    fetchingNotificationsRef.current = true;
    abortNotificationsRef.current?.abort();
    abortNotificationsRef.current = new AbortController();

    try {
      const res = await fetch('/api/notifications', {
        signal: abortNotificationsRef.current.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const list: NotificationItem[] = Array.isArray(data.items) ? data.items : [];
        setNotifications(list);
        setUrgentCount(Number(data.urgentCount ?? 0));

        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          const now = Date.now();
          for (const item of list) {
            if (item.kind !== 'session') continue;
            const startMs = new Date(item.time).getTime();
            const diffMins = Math.round((startMs - now) / 60000);
            if (diffMins >= 0 && diffMins <= 30 && !notifiedIdsRef.current.has(item.id)) {
              notifiedIdsRef.current.add(item.id);
              new Notification(`Nhắc lịch học (${diffMins} phút nữa)`, {
                body: `${item.title} — ${item.subtitle}`,
              });
            }
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        // ignore
      }
    } finally {
      fetchingNotificationsRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchSemesters();
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 60000);
    const onSemUpdate = () => fetchSemesters();
    window.addEventListener('semesters-updated', onSemUpdate);
    window.addEventListener('semester-changed', onSemUpdate);

    return () => {
      clearInterval(interval);
      abortSemestersRef.current?.abort();
      abortNotificationsRef.current?.abort();
      window.removeEventListener('semesters-updated', onSemUpdate);
      window.removeEventListener('semester-changed', onSemUpdate);
    };
  }, [fetchSemesters, fetchNotifications]);

  // Global search debounce with AbortController cleanup
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    abortSearchRef.current?.abort();

    const q = searchQuery.trim();
    if (!q) {
      setIsSearching(false);
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortSearchRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data: SearchResults = await res.json();
          setSearchResults(data);
          setSearchOpen(true);
        }
      } catch (e: unknown) {
        if ((e as Error)?.name !== 'AbortError') {
          // ignore
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 280);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      abortSearchRef.current?.abort();
    };
  }, [searchQuery]);

  const handleSemesterChange = async (value: string) => {
    setActiveSemester(value);
    invalidateCache();
    try {
      const res = await fetch(`/api/semesters/${value}/activate`, { method: 'POST' });
      if (res.ok) {
        toast.success('Đã chuyển học kỳ hiện tại');
        window.dispatchEvent(new CustomEvent('semester-changed', { detail: value }));
      }
    } catch {
      toast.error('Không thể đổi học kỳ');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(false);
      setMobileSearchOpen(false);
      router.push(`/notes?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchOpen(false);
  };

  const handleNavigateFromSearch = (href: string) => {
    setSearchOpen(false);
    setMobileSearchOpen(false);
    router.push(href);
  };

  const handleRequestBrowserNotify = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Trình duyệt không hỗ trợ thông báo đẩy');
      return;
    }
    const perm = await Notification.requestPermission();
    setBrowserNotifyEnabled(perm === 'granted');
    if (perm === 'granted') {
      toast.success('Đã bật nhắc lịch học trước giờ học');
    } else {
      toast.warning('Bạn chưa cấp quyền thông báo cho trình duyệt');
    }
  };

  const totalSearchHits = searchResults
    ? searchResults.courses.length +
      searchResults.notes.length +
      searchResults.assignments.length +
      searchResults.exams.length
    : 0;

  const isDark = mounted && resolvedTheme === 'dark';

  const userInitial =
    session?.user?.name?.[0]?.toUpperCase() ||
    session?.user?.email?.[0]?.toUpperCase() ||
    'U';

  const renderSearchDropdown = () => {
    if (!searchOpen || !searchResults) return null;

    return (
      <>
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40"
          onClick={() => setSearchOpen(false)}
        />
        <div
          role="listbox"
          aria-label="Kết quả tìm kiếm nhanh"
          className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated max-h-[72vh] overflow-y-auto p-2 space-y-2.5 animate-scale-in"
        >
          {totalSearchHits === 0 ? (
            <div className="py-6 px-3 text-center space-y-1">
              <p className="text-xs font-medium text-foreground">
                Không tìm thấy kết quả cho &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-[11px] text-muted-foreground">
                Thử tìm theo tên môn học, mã môn, tiêu đề bài tập hoặc nội dung ghi chú.
              </p>
            </div>
          ) : (
            <>
              {searchResults.courses.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Môn học
                  </p>
                  {searchResults.courses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        handleNavigateFromSearch(
                          `/courses?search=${encodeURIComponent(c.courseCode || c.name)}`
                        )
                      }
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left"
                    >
                      <BookOpen className="w-4 h-4 shrink-0" style={{ color: c.color }} />
                      <span className="truncate font-medium text-foreground">{c.name}</span>
                      {c.courseCode && (
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {c.courseCode}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {searchResults.notes.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ghi chú buổi học
                  </p>
                  {searchResults.notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() =>
                        handleNavigateFromSearch(
                          `/notes?search=${encodeURIComponent(searchQuery.trim())}`
                        )
                      }
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left"
                    >
                      <StickyNote className="w-4 h-4 shrink-0 text-amber-500" />
                      <span className="truncate text-foreground">{n.course.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0 tabular-nums">
                        {formatShortDate(n.date)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.assignments.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Bài tập
                  </p>
                  {searchResults.assignments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleNavigateFromSearch('/assignments')}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left"
                    >
                      <ClipboardList className="w-4 h-4 shrink-0 text-primary" />
                      <span className="truncate text-foreground">{a.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0 tabular-nums">
                        {formatShortDate(a.dueDate)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.exams.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Lịch thi
                  </p>
                  {searchResults.exams.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => handleNavigateFromSearch('/exams')}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 shrink-0 text-rose-500" />
                      <span className="truncate text-foreground">{ex.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0 tabular-nums">
                        {formatShortDate(ex.date)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <header className="h-16 border-b border-border/80 bg-card/85 backdrop-blur-md flex items-center justify-between px-3 sm:px-5 gap-2.5 sticky top-0 z-30">
      {/* Mobile expanded search bar */}
      {mobileSearchOpen && (
        <div className="absolute inset-x-0 top-0 h-16 bg-card px-3 flex items-center gap-2 z-50 sm:hidden border-b border-border">
          <div className="relative flex-1">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={mobileSearchInputRef}
                type="search"
                aria-label="Tìm kiếm nhanh"
                placeholder="Tìm môn học, bài tập, ghi chú..."
                className="pl-9 pr-8 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults && searchQuery.trim()) setSearchOpen(true);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
            {renderSearchDropdown()}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMobileSearchOpen(false);
              setSearchOpen(false);
            }}
          >
            Đóng
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MobileMenuButton onClick={onMobileMenuClick} />

        {/* Mobile search trigger */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mở tìm kiếm nhanh"
          className="sm:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMobileSearchOpen(true);
            setTimeout(() => mobileSearchInputRef.current?.focus(), 20);
          }}
        >
          <Search className="w-5 h-5" />
        </Button>

        {/* Desktop & Tablet Global Search */}
        <div className="relative hidden sm:block max-w-md flex-1">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="search"
              aria-label="Tìm kiếm môn học, ghi chú, bài tập, lịch thi"
              placeholder="Tìm môn học, ghi chú, bài tập, lịch thi..."
              className="pl-9 pr-16 h-9 bg-background/70 focus:bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults && searchQuery.trim()) setSearchOpen(true);
              }}
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden lg:inline-flex items-center rounded border border-border bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground select-none">
                  Ctrl K
                </kbd>
              )}
            </div>
          </form>

          {renderSearchDropdown()}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Semester selector */}
        {semesters.length > 0 && (
          <Select value={activeSemester} onValueChange={handleSemesterChange}>
            <SelectTrigger
              aria-label="Chọn học kỳ hiện tại"
              className="w-[155px] lg:w-[205px] h-9 hidden md:flex rounded-lg bg-background/70 text-xs sm:text-sm"
            >
              <SelectValue placeholder="Chọn học kỳ" />
            </SelectTrigger>
            <SelectContent>
              {semesters.map((sem) => (
                <SelectItem key={sem.id} value={sem.id}>
                  {sem.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Quick add */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5 px-3">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Thêm mới</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Tạo nhanh
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push('/courses?action=new')}
              className="gap-2 rounded-lg cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-primary" />
              Môn học & Lịch học
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/assignments?action=new')}
              className="gap-2 rounded-lg cursor-pointer"
            >
              <ClipboardList className="w-4 h-4 text-amber-500" />
              Bài tập mới
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/exams?action=new')}
              className="gap-2 rounded-lg cursor-pointer"
            >
              <FileText className="w-4 h-4 text-rose-500" />
              Lịch thi mới
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
        >
          {isDark ? (
            <Sun className="w-[18px] h-[18px] text-amber-500" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </Button>

        {/* Notifications */}
        <Popover open={notifyOpen} onOpenChange={setNotifyOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label={
                notifications.length > 0
                  ? `Thông báo (${notifications.length} mục)`
                  : 'Thông báo'
              }
            >
              <Bell className="w-[18px] h-[18px]" />
              {notifications.length > 0 && (
                <span
                  className={cn(
                    'absolute top-0.5 right-0.5 min-w-[17px] h-[17px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 text-white ring-2 ring-card',
                    urgentCount > 0 ? 'bg-rose-600' : 'bg-primary'
                  )}
                >
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 sm:w-[340px] rounded-xl p-0 overflow-hidden shadow-elevated">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  Nhắc lịch & Deadline
                </span>
                {urgentCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                    {urgentCount} gấp
                  </Badge>
                )}
              </div>
              {!browserNotifyEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 text-primary hover:text-primary"
                  onClick={handleRequestBrowserNotify}
                >
                  Bật nhắc giờ
                </Button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border/70">
              {notifications.length === 0 ? (
                <div className="py-8 px-4 text-center space-y-1.5">
                  <Bell className="w-6 h-6 text-muted-foreground/50 mx-auto" />
                  <p className="text-xs font-medium text-foreground">
                    Không có thông báo mới
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Lịch học sắp tới và deadline bài tập sẽ xuất hiện tại đây.
                  </p>
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setNotifyOpen(false);
                      router.push(item.href);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-accent/60 transition-colors flex items-start gap-3"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ring-2 ring-background"
                      style={{ backgroundColor: item.color || '#3b82f6' }}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {item.title}
                        </p>
                        {item.urgent && (
                          <Badge
                            variant="destructive"
                            className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                          >
                            Gấp
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Tài khoản cá nhân"
              className="h-9 w-9 rounded-full"
            >
              <Avatar className="w-8 h-8 ring-1 ring-border">
                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary dark:text-blue-400">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
            <DropdownMenuLabel className="px-2.5 py-2">
              <p className="font-semibold text-sm text-foreground truncate">
                {session?.user?.name || 'Sinh viên'}
              </p>
              <p className="text-xs text-muted-foreground font-normal truncate">
                {session?.user?.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push('/dashboard')}
              className="rounded-lg cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4 mr-2 text-muted-foreground" />
              Tổng quan
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/schedule')}
              className="rounded-lg cursor-pointer"
            >
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
              Thời khóa biểu
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/settings')}
              className="rounded-lg cursor-pointer"
            >
              <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
              Cài đặt & Dữ liệu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
});
