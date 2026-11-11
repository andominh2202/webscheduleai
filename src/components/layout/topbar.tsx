'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  Bell,
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  StickyNote,
  Sun,
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
import { MobileMenuButton } from './sidebar';

interface Semester {
  id: string;
  name: string;
  isActive: boolean;
}

interface SearchResults {
  courses: { id: string; name: string; courseCode: string; color: string }[];
  notes: { id: string; date: string; content?: string | null; course: { name: string; color: string } }[];
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

export function Topbar({ onMobileMenuClick }: TopbarProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [activeSemester, setActiveSemester] = useState<string>('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [urgentCount, setUrgentCount] = useState(0);
  const [browserNotifyEnabled, setBrowserNotifyEnabled] = useState(false);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserNotifyEnabled(Notification.permission === 'granted');
    }
  }, []);

  const fetchSemesters = useCallback(async () => {
    try {
      const res = await fetch('/api/semesters', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSemesters(Array.isArray(data) ? data : []);
        const active = data.find((s: Semester) => s.isActive);
        if (active) setActiveSemester(active.id);
        else if (data.length > 0) setActiveSemester(data[0].id);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list: NotificationItem[] = Array.isArray(data.items) ? data.items : [];
        setNotifications(list);
        setUrgentCount(Number(data.urgentCount ?? 0));

        // Nhắc lịch trước giờ học 15-30 phút nếu người dùng đã bật Notification
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
    } catch {
      // ignore
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
      window.removeEventListener('semesters-updated', onSemUpdate);
      window.removeEventListener('semester-changed', onSemUpdate);
    };
  }, [fetchSemesters, fetchNotifications]);

  // Global search debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: SearchResults = await res.json();
          setSearchResults(data);
          setSearchOpen(true);
        }
      } catch {
        // ignore
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const handleSemesterChange = async (value: string) => {
    setActiveSemester(value);
    try {
      const res = await fetch(`/api/semesters/${value}/activate`, { method: 'POST' });
      if (res.ok) {
        toast.success('Đã chuyển học kỳ hiện tại');
        window.dispatchEvent(new CustomEvent('semester-changed', { detail: value }));
        router.refresh();
      }
    } catch {
      toast.error('Không thể đổi học kỳ');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(false);
      router.push(`/notes?search=${encodeURIComponent(searchQuery.trim())}`);
    }
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

  const userInitial =
    session?.user?.name?.[0]?.toUpperCase() ||
    session?.user?.email?.[0]?.toUpperCase() ||
    'U';

  return (
    <header className="h-16 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MobileMenuButton onClick={onMobileMenuClick} />

        {/* Global Search */}
        <div className="relative hidden sm:block max-w-md flex-1">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm môn học, ghi chú, bài tập, lịch thi..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults && searchQuery.trim()) setSearchOpen(true);
              }}
            />
          </form>

          {searchOpen && searchResults && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSearchOpen(false)}
              />
              <div className="absolute left-0 right-0 top-11 z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg max-h-[70vh] overflow-y-auto p-2 space-y-2">
                {totalSearchHits === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Không tìm thấy kết quả cho &ldquo;{searchQuery}&rdquo;
                  </p>
                ) : (
                  <>
                    {searchResults.courses.length > 0 && (
                      <div className="space-y-1">
                        <p className="px-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          Môn học
                        </p>
                        {searchResults.courses.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              router.push('/courses');
                            }}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                          >
                            <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: c.color }} />
                            <span className="truncate font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{c.courseCode}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.notes.length > 0 && (
                      <div className="space-y-1">
                        <p className="px-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          Ghi chú buổi học
                        </p>
                        {searchResults.notes.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              router.push(`/notes?search=${encodeURIComponent(searchQuery.trim())}`);
                            }}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                          >
                            <StickyNote className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                            <span className="truncate">{n.course.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatShortDate(n.date)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.assignments.length > 0 && (
                      <div className="space-y-1">
                        <p className="px-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          Bài tập
                        </p>
                        {searchResults.assignments.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              router.push('/assignments');
                            }}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                          >
                            <ClipboardList className="w-3.5 h-3.5 shrink-0 text-primary" />
                            <span className="truncate">{a.title}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatShortDate(a.dueDate)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.exams.length > 0 && (
                      <div className="space-y-1">
                        <p className="px-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          Lịch thi
                        </p>
                        {searchResults.exams.map((ex) => (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              router.push('/exams');
                            }}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                            <span className="truncate">{ex.title}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
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
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Semester selector */}
        {semesters.length > 0 && (
          <Select value={activeSemester} onValueChange={handleSemesterChange}>
            <SelectTrigger className="w-[180px] lg:w-[210px] hidden md:flex">
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
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Thêm mới</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Thêm nhanh</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/courses?action=new')}>
              Môn học & Lịch học
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/assignments?action=new')}>
              Bài tập mới
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/exams?action=new')}>
              Lịch thi mới
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Chuyển giao diện sáng/tối"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
        )}

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 text-white',
                    urgentCount > 0 ? 'bg-rose-600' : 'bg-primary'
                  )}
                >
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">Nhắc lịch & Deadline</span>
              {!browserNotifyEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 text-primary"
                  onClick={handleRequestBrowserNotify}
                >
                  Bật nhắc giờ học
                </Button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Không có lịch học hay deadline sắp tới
                </p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent/50 transition-colors flex items-start gap-2.5"
                  >
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: item.color || '#3b82f6' }}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{item.title}</p>
                        {item.urgent && (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
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
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium truncate">{session?.user?.name || 'Sinh viên'}</p>
              <p className="text-xs text-muted-foreground font-normal truncate">
                {session?.user?.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/schedule')}>
              <Calendar className="w-4 h-4 mr-2" />
              Thời khóa biểu
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Cài đặt & Dữ liệu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );

  function handleSearch(e: React.FormEvent) {
    handleSearchSubmit(e);
  }
}
