'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  MapPin,
  RefreshCw,
  StickyNote,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  cn,
  formatDate,
  formatShortDate,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  SESSION_STATUS_LABELS,
} from '@/lib/utils';
import { SessionDetailPanel } from '@/components/sessions/session-detail-panel';

interface CourseSummary {
  id: string;
  name: string;
  courseCode?: string | null;
  color: string;
  instructor?: string | null;
}

interface SessionItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  location?: string | null;
  status: string;
  type?: string;
  content?: string | null;
  personalNote?: string | null;
  course: CourseSummary;
}

interface AssignmentItem {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  completed: boolean;
  priority: string;
  course: CourseSummary;
}

interface DashboardData {
  coursesCount: number;
  weeklySessionsCount: number;
  pendingAssignmentsCount: number;
  upcomingExamsCount: number;
  todaySessions: SessionItem[];
  nextSession: SessionItem | null;
  nearestDeadlines: AssignmentItem[];
  recentNotes: SessionItem[];
  completedSessionsCount: number;
  totalSessionsCount: number;
}

function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '00:00';
  const [h = '00', m = '00'] = timeStr.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function buildSessionDateTime(dateStr: string, timeStr: string): Date {
  const datePart = format(new Date(dateStr), 'yyyy-MM-dd');
  const normTime = normalizeTime(timeStr);
  return new Date(`${datePart}T${normTime}:00`);
}

function formatCountdown(session: SessionItem, now: Date): string {
  const start = buildSessionDateTime(session.date, session.startTime);
  const end = buildSessionDateTime(session.date, session.endTime);

  if (now >= start && now <= end) {
    const minsLeft = Math.max(1, Math.round((end.getTime() - now.getTime()) / 60000));
    return `Đang diễn ra (còn ${minsLeft} phút)`;
  }

  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 'Sắp bắt đầu';
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `Còn ${days} ngày ${hours} giờ` : `Còn ${days} ngày`;
  }
  if (hours > 0) {
    return minutes > 0 ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${hours} giờ`;
  }
  return `Còn ${Math.max(1, minutes)} phút`;
}

function getDueBadgeInfo(dueDateStr: string, now: Date): { label: string; className: string } {
  const due = new Date(dueDateStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      label: `Quá hạn ${Math.abs(diffDays)} ngày`,
      className: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800',
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Hôm nay',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Ngày mai',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    };
  }
  return {
    label: `Còn ${diffDays} ngày`,
    className: 'bg-muted text-muted-foreground',
  };
}

function stripNotePreview(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-md bg-muted" />
          <div className="h-4 w-64 rounded-md bg-muted" />
        </div>
        <div className="h-9 w-40 rounded-md bg-muted" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-8 w-14 rounded bg-muted" />
              </div>
              <div className="h-11 w-11 rounded-xl bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-5 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-20 rounded-lg bg-muted" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-44 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-muted" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-6 rounded-full bg-muted" />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-14 rounded-lg bg-muted" />
              <div className="h-14 rounded-lg bg-muted" />
              <div className="h-14 rounded-lg bg-muted" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-muted" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Không thể tải dữ liệu tổng quan');
      }
      const raw = await res.json();

      // Normalize fields from /api/dashboard
      const coursesCount = Number(raw.coursesCount ?? 0);
      const weeklySessionsCount = Number(raw.weeklySessionsCount ?? 0);
      const todaySessions: SessionItem[] = Array.isArray(raw.todaySessions)
        ? raw.todaySessions
        : [];
      const nextSession: SessionItem | null = raw.nextSession ?? null;
      const recentNotes: SessionItem[] = Array.isArray(raw.recentNotes)
        ? raw.recentNotes.slice(0, 5)
        : [];

      const pendingAssignmentsCount =
        typeof raw.pendingAssignments === 'number'
          ? raw.pendingAssignments
          : Array.isArray(raw.pendingAssignments)
            ? raw.pendingAssignments.length
            : Number(raw.pendingAssignmentsCount ?? 0);

      let nearestDeadlines: AssignmentItem[] = Array.isArray(raw.nearestDeadlines)
        ? raw.nearestDeadlines
        : Array.isArray(raw.upcomingAssignments)
          ? raw.upcomingAssignments
          : Array.isArray(raw.pendingAssignments)
            ? raw.pendingAssignments
            : raw.nearestDeadline
              ? [raw.nearestDeadline]
              : [];

      let upcomingExamsCount: number | undefined =
        typeof raw.upcomingExamsCount === 'number'
          ? raw.upcomingExamsCount
          : Array.isArray(raw.upcomingExams)
            ? raw.upcomingExams.length
            : undefined;

      let completedSessionsCount: number | undefined =
        typeof raw.completedSessionsCount === 'number'
          ? raw.completedSessionsCount
          : typeof raw.completedSessions === 'number'
            ? raw.completedSessions
            : undefined;

      let totalSessionsCount: number | undefined =
        typeof raw.totalSessionsCount === 'number'
          ? raw.totalSessionsCount
          : typeof raw.totalSessions === 'number'
            ? raw.totalSessions
            : undefined;

      // Fallback fetches only when optional fields aren't provided by /api/dashboard
      const fallbackPromises: Promise<void>[] = [];

      if (upcomingExamsCount === undefined) {
        fallbackPromises.push(
          fetch('/api/exams', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((exams: Array<{ date: string }>) => {
              if (Array.isArray(exams)) {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                upcomingExamsCount = exams.filter(
                  (e) => new Date(e.date) >= startOfToday
                ).length;
              } else {
                upcomingExamsCount = 0;
              }
            })
            .catch(() => {
              upcomingExamsCount = 0;
            })
        );
      }

      if (nearestDeadlines.length <= 1 && pendingAssignmentsCount > nearestDeadlines.length && !Array.isArray(raw.nearestDeadlines)) {
        fallbackPromises.push(
          fetch('/api/assignments?completed=false', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((assignments: AssignmentItem[]) => {
              if (Array.isArray(assignments) && assignments.length > 0) {
                nearestDeadlines = [...assignments]
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .slice(0, 5);
              }
            })
            .catch(() => {
              // keep existing nearestDeadlines
            })
        );
      }

      if (completedSessionsCount === undefined || totalSessionsCount === undefined) {
        fallbackPromises.push(
          fetch('/api/sessions', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((sessions: Array<{ status: string }>) => {
              if (Array.isArray(sessions)) {
                const validSessions = sessions.filter((s) => s.status !== 'cancelled');
                totalSessionsCount = validSessions.length;
                completedSessionsCount = validSessions.filter(
                  (s) => s.status === 'completed'
                ).length;
              } else {
                totalSessionsCount = 0;
                completedSessionsCount = 0;
              }
            })
            .catch(() => {
              totalSessionsCount = 0;
              completedSessionsCount = 0;
            })
        );
      }

      if (fallbackPromises.length > 0) {
        await Promise.all(fallbackPromises);
      }

      setData({
        coursesCount,
        weeklySessionsCount,
        pendingAssignmentsCount,
        upcomingExamsCount: upcomingExamsCount ?? 0,
        todaySessions: [...todaySessions].sort((a, b) =>
          normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime))
        ),
        nextSession,
        nearestDeadlines: nearestDeadlines.slice(0, 5),
        recentNotes: recentNotes.slice(0, 5),
        completedSessionsCount: completedSessionsCount ?? 0,
        totalSessionsCount: totalSessionsCount ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const handler = () => fetchDashboard();
    window.addEventListener('semester-changed', handler);
    return () => window.removeEventListener('semester-changed', handler);
  }, [fetchDashboard]);

  // Update live countdown every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const progressPercentage = useMemo(() => {
    if (!data || data.totalSessionsCount <= 0) return 0;
    return Math.min(
      100,
      Math.round((data.completedSessionsCount / data.totalSessionsCount) * 100)
    );
  }, [data]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="max-w-lg mx-auto mt-8">
        <CardContent className="p-6 text-center space-y-4">
          <p className="text-sm text-destructive font-medium">
            {error || 'Không thể tải dữ liệu bảng điều khiển'}
          </p>
          <Button onClick={fetchDashboard} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statCards = [
    {
      label: 'Số môn học',
      value: data.coursesCount,
      icon: BookOpen,
      borderAccent: 'border-l-blue-500',
      iconClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      href: '/courses',
    },
    {
      label: 'Buổi học tuần này',
      value: data.weeklySessionsCount,
      icon: CalendarDays,
      borderAccent: 'border-l-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      href: '/schedule',
    },
    {
      label: 'Bài tập chưa xong',
      value: data.pendingAssignmentsCount,
      icon: ClipboardList,
      borderAccent: 'border-l-amber-500',
      iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      href: '/assignments',
    },
    {
      label: 'Lịch thi sắp tới',
      value: data.upcomingExamsCount,
      icon: GraduationCap,
      borderAccent: 'border-l-rose-500',
      iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      href: '/exams',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {formatDate(now)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDashboard} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/schedule">
              <Calendar className="w-4 h-4" />
              Xem thời khóa biểu
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="block group">
              <Card
                className={cn(
                  'border-l-4 transition-all hover:shadow-md',
                  stat.borderAccent
                )}
              >
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground truncate">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                  </div>
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105',
                      stat.iconClass
                    )}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Next Upcoming Session */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Buổi học tiếp theo
                </CardTitle>
                {data.nextSession && (
                  <Badge variant="secondary" className="font-medium">
                    {formatCountdown(data.nextSession, now)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {data.nextSession ? (
                <div
                  className="rounded-lg border p-4 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: data.nextSession.course?.color || '#3b82f6',
                  }}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: data.nextSession.course?.color || '#3b82f6',
                        }}
                      />
                      <h3 className="font-semibold text-base truncate">
                        {data.nextSession.course?.name}
                      </h3>
                      {data.nextSession.course?.courseCode && (
                        <Badge variant="outline" className="text-xs">
                          {data.nextSession.course.courseCode}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="w-4 h-4" />
                        {format(new Date(data.nextSession.date), 'EEEE, dd/MM/yyyy', {
                          locale: vi,
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {normalizeTime(data.nextSession.startTime)} -{' '}
                        {normalizeTime(data.nextSession.endTime)}
                      </span>
                      {(data.nextSession.room || data.nextSession.location) && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {[data.nextSession.room, data.nextSession.location]
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSessionId(data.nextSession!.id)}
                    className="flex-shrink-0 gap-1"
                  >
                    Chi tiết
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Không có buổi học sắp tới nào
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Sessions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Lịch học hôm nay
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {data.todaySessions.length > 0
                      ? `Bạn có ${data.todaySessions.length} buổi học hôm nay`
                      : 'Hôm nay bạn không có lịch học'}
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/schedule" className="gap-1 text-xs">
                    Mở lịch
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.todaySessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Chưa có buổi học nào trong ngày hôm nay
                </div>
              ) : (
                <div className="space-y-3">
                  {data.todaySessions.map((session) => {
                    const color = session.course?.color || '#3b82f6';
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3.5 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div
                            className="w-1.5 h-10 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="font-semibold text-sm truncate"
                                style={{ color }}
                              >
                                {session.course?.name}
                              </span>
                              {session.course?.courseCode && (
                                <span className="text-xs text-muted-foreground">
                                  ({session.course.courseCode})
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                <Clock className="w-3.5 h-3.5" />
                                {normalizeTime(session.startTime)} -{' '}
                                {normalizeTime(session.endTime)}
                              </span>
                              {session.room && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" />
                                  Phòng {session.room}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant={
                            session.status === 'completed'
                              ? 'default'
                              : session.status === 'cancelled'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="self-start sm:self-center flex-shrink-0"
                        >
                          {SESSION_STATUS_LABELS[session.status] || session.status}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Study Progress */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Tiến độ học tập
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Tỷ lệ buổi học đã hoàn thành trên tổng số buổi học
                  </CardDescription>
                </div>
                <span className="text-2xl font-bold text-primary">
                  {progressPercentage}%
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={progressPercentage} className="h-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Đã hoàn thành{' '}
                  <strong className="text-foreground">
                    {data.completedSessionsCount}
                  </strong>{' '}
                  / {data.totalSessionsCount} buổi học
                </span>
                <span>
                  Còn lại{' '}
                  <strong className="text-foreground">
                    {Math.max(0, data.totalSessionsCount - data.completedSessionsCount)}
                  </strong>{' '}
                  buổi
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Nearest Deadlines */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" />
                  Deadline gần nhất
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/assignments" className="text-xs gap-1">
                    Tất cả
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.nearestDeadlines.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Không có bài tập sắp đến hạn
                </div>
              ) : (
                <div className="space-y-3">
                  {data.nearestDeadlines.map((item) => {
                    const dueInfo = getDueBadgeInfo(item.dueDate, now);
                    const priorityClass =
                      PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                    return (
                      <Link
                        key={item.id}
                        href="/assignments"
                        className="block rounded-lg border p-3 hover:bg-accent/40 transition-colors space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm leading-snug line-clamp-2">
                            {item.title}
                          </p>
                          <span
                            className={cn(
                              'text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                              priorityClass
                            )}
                          >
                            {PRIORITY_LABELS[item.priority] || item.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: item.course?.color || '#3b82f6',
                              }}
                            />
                            <span className="truncate">{item.course?.name}</span>
                          </span>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded border text-[11px] font-medium flex-shrink-0',
                              dueInfo.className
                            )}
                          >
                            {formatShortDate(item.dueDate)} • {dueInfo.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Notes */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <StickyNote className="w-5 h-5 text-emerald-500" />
                  Ghi chú gần đây
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/notes" className="text-xs gap-1">
                    Tất cả
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.recentNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Chưa có ghi chú buổi học nào
                </div>
              ) : (
                <div className="space-y-3">
                  {data.recentNotes.map((noteSession) => {
                    const preview = stripNotePreview(
                      noteSession.content || noteSession.personalNote
                    );
                    const color = noteSession.course?.color || '#3b82f6';
                    return (
                      <button
                        key={noteSession.id}
                        type="button"
                        onClick={() => setSelectedSessionId(noteSession.id)}
                        className="w-full text-left block rounded-lg border p-3 hover:bg-accent/40 transition-colors space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-semibold truncate"
                            style={{ color }}
                          >
                            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {noteSession.course?.name}
                            </span>
                          </span>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">
                            {formatShortDate(noteSession.date)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {preview || 'Không có nội dung xem trước'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SessionDetailPanel
        sessionId={selectedSessionId}
        open={Boolean(selectedSessionId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedSessionId(null);
        }}
        onClose={() => setSelectedSessionId(null)}
        onUpdated={fetchDashboard}
      />
    </div>
  );
}
