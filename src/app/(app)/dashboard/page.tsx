'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  MapPin,
  RefreshCw,
  Sparkles,
  StickyNote,
  TrendingUp,
  User,
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
  EXAM_TYPE_LABELS,
  formatDate,
  formatShortDate,
  PRIORITY_LABELS,
  SESSION_STATUS_LABELS,
} from '@/lib/utils';
import { getCached, invalidateCache, setCached } from '@/lib/client-cache';

const SessionDetailPanel = dynamic(
  () =>
    import('@/components/sessions/session-detail-panel').then(
      (m) => m.SessionDetailPanel
    ),
  { ssr: false }
);

interface ActiveSemesterSummary {
  id: string;
  name: string;
  isActive?: boolean;
}

interface CourseSummary {
  id: string;
  name: string;
  courseCode?: string | null;
  color: string;
  instructor?: string | null;
  semesterId?: string;
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

interface ExamSummaryItem {
  id: string;
  title: string;
  type: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  room?: string | null;
  location?: string | null;
  courseId: string;
  course?: CourseSummary;
}

interface DashboardData {
  activeSemester: ActiveSemesterSummary | null;
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

const HTML_TAG_RE = /<[^>]*>/g;
const WHITESPACE_RE = /\s+/g;

const PRIORITY_BADGE_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20',
  urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

const EXAM_BADGE_STYLES: Record<string, string> = {
  quiz: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  midterm: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  final: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
  other: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
};

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

function isSessionLive(session: SessionItem, now: Date): boolean {
  if (session.status === 'cancelled') return false;
  const start = buildSessionDateTime(session.date, session.startTime);
  const end = buildSessionDateTime(session.date, session.endTime);
  return now >= start && now <= end;
}

function formatCountdown(session: SessionItem, now: Date): string {
  const start = buildSessionDateTime(session.date, session.startTime);
  const end = buildSessionDateTime(session.date, session.endTime);

  if (now >= start && now <= end) {
    const minsLeft = Math.max(1, Math.round((end.getTime() - now.getTime()) / 60000));
    return `Đang diễn ra • còn ${minsLeft} phút`;
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

function getDueBadgeInfo(
  dueDateStr: string,
  now: Date
): { label: string; className: string; isUrgent: boolean } {
  const due = new Date(dueDateStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      label: `Quá hạn ${Math.abs(diffDays)} ngày`,
      className:
        'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
      isUrgent: true,
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Hôm nay',
      className:
        'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
      isUrgent: true,
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Ngày mai',
      className:
        'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      isUrgent: true,
    };
  }
  if (diffDays <= 3) {
    return {
      label: `Còn ${diffDays} ngày`,
      className:
        'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
      isUrgent: false,
    };
  }
  return {
    label: `Còn ${diffDays} ngày`,
    className: 'bg-muted text-muted-foreground border-border',
    isUrgent: false,
  };
}

function stripNotePreview(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(HTML_TAG_RE, ' ').replace(WHITESPACE_RE, ' ').trim();
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Đang tải tổng quan">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-md bg-muted" />
          <div className="h-4 w-64 rounded-md bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-40 rounded-md bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 sm:p-5 flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3.5 w-24 rounded bg-muted" />
                <div className="h-8 w-12 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-5 w-44 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-24 rounded-xl bg-muted" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-16 rounded-xl bg-muted" />
              <div className="h-16 rounded-xl bg-muted" />
              <div className="h-16 rounded-xl bg-muted" />
            </CardContent>
          </Card>
        </div>
        <div className="xl:col-span-5 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="h-16 rounded-xl bg-muted" />
              <div className="h-16 rounded-xl bg-muted" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="h-16 rounded-xl bg-muted" />
              <div className="h-16 rounded-xl bg-muted" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const cachedData = getCached<DashboardData>('/api/dashboard');
  const cachedExams = getCached<ExamSummaryItem[]>('/api/exams');

  const [data, setData] = useState<DashboardData | null>(() => cachedData || null);
  const [exams, setExams] = useState<ExamSummaryItem[]>(() => cachedExams || []);
  const [loading, setLoading] = useState(() => !cachedData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const dataRef = useRef<DashboardData | null>(cachedData || null);

  const fetchDashboard = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    if (!isSilent && !dataRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const [dashRes, examsRes] = await Promise.all([
        fetch('/api/dashboard', { signal: ctrl.signal }),
        fetch('/api/exams', { signal: ctrl.signal }).catch(() => null),
      ]);

      if (!dashRes.ok) {
        throw new Error('Không thể tải dữ liệu tổng quan');
      }
      const raw = await dashRes.json();

      if (examsRes && examsRes.ok) {
        const rawExams = await examsRes.json().catch(() => []);
        const examList: ExamSummaryItem[] = Array.isArray(rawExams) ? rawExams : [];
        setExams(examList);
        setCached('/api/exams', examList);
      }

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

      const nearestDeadlines: AssignmentItem[] = Array.isArray(raw.nearestDeadlines)
        ? raw.nearestDeadlines
        : Array.isArray(raw.upcomingAssignments)
          ? raw.upcomingAssignments
          : Array.isArray(raw.pendingAssignments)
            ? raw.pendingAssignments
            : raw.nearestDeadline
              ? [raw.nearestDeadline]
              : [];

      const nextData: DashboardData = {
        activeSemester: raw.activeSemester ?? null,
        coursesCount,
        weeklySessionsCount,
        pendingAssignmentsCount,
        upcomingExamsCount: Number(raw.upcomingExamsCount ?? 0),
        todaySessions: [...todaySessions].sort((a, b) =>
          normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime))
        ),
        nextSession,
        nearestDeadlines: nearestDeadlines.slice(0, 5),
        recentNotes: recentNotes.slice(0, 5),
        completedSessionsCount: Number(raw.completedSessionsCount ?? 0),
        totalSessionsCount: Number(raw.totalSessionsCount ?? 0),
      };

      dataRef.current = nextData;
      setCached('/api/dashboard', nextData);
      setData(nextData);
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    return () => {
      abortCtrlRef.current?.abort();
    };
  }, [fetchDashboard]);

  useEffect(() => {
    const handler = () => fetchDashboard(true);
    window.addEventListener('semester-changed', handler);
    return () => {
      window.removeEventListener('semester-changed', handler);
    };
  }, [fetchDashboard]);

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

  const upcomingExams = useMemo(() => {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const activeSemId = data?.activeSemester?.id;

    return exams
      .filter((e) => {
        if (activeSemId && e.course?.semesterId && e.course.semesterId !== activeSemId) {
          return false;
        }
        const examDay = new Date(e.date);
        const startOfExam = new Date(
          examDay.getFullYear(),
          examDay.getMonth(),
          examDay.getDate()
        );
        return startOfExam >= startOfToday;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [exams, data?.activeSemester?.id, now]);

  const recentNotesWithPreview = useMemo(() => {
    if (!data) return [];
    return data.recentNotes.map((noteSession) => ({
      session: noteSession,
      hasLecture: Boolean(stripNotePreview(noteSession.content)),
      hasPersonal: Boolean(stripNotePreview(noteSession.personalNote)),
      preview: stripNotePreview(noteSession.content || noteSession.personalNote),
    }));
  }, [data]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return (
      <Card className="max-w-lg mx-auto mt-8 border-destructive/30">
        <CardContent className="p-6 text-center space-y-4">
          <div className="h-11 w-11 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">Không thể tải dữ liệu bảng điều khiển</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => fetchDashboard()} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const statCards = [
    {
      label: 'Số môn học',
      sublabel: 'Trong học kỳ này',
      value: data.coursesCount,
      icon: BookOpen,
      accentBar: 'bg-blue-500',
      iconClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      href: '/courses',
    },
    {
      label: 'Buổi học tuần này',
      sublabel: `${data.todaySessions.length} buổi hôm nay`,
      value: data.weeklySessionsCount,
      icon: CalendarDays,
      accentBar: 'bg-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      href: '/schedule',
    },
    {
      label: 'Bài tập cần làm',
      sublabel:
        data.pendingAssignmentsCount > 0 ? 'Cần theo dõi hạn nộp' : 'Đã hoàn tất hết',
      value: data.pendingAssignmentsCount,
      icon: ClipboardList,
      accentBar: 'bg-amber-500',
      iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      href: '/assignments',
    },
    {
      label: 'Lịch thi sắp tới',
      sublabel: data.upcomingExamsCount > 0 ? 'Sẵn sàng ôn tập' : 'Chưa có kỳ thi mới',
      value: data.upcomingExamsCount,
      icon: GraduationCap,
      accentBar: 'bg-rose-500',
      iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      href: '/exams',
    },
  ];

  const nextIsLive = data.nextSession ? isSessionLive(data.nextSession, now) : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Tổng quan học tập</h1>
            {data.activeSemester?.name && (
              <Badge variant="secondary" className="font-medium text-xs">
                {data.activeSemester.name}
              </Badge>
            )}
          </div>
          <p
            suppressHydrationWarning
            className="text-sm text-muted-foreground capitalize"
          >
            {formatDate(now)}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              invalidateCache('/api/dashboard');
              invalidateCache('/api/exams');
              fetchDashboard(true);
            }}
            className="gap-1.5"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Làm mới
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/schedule">
              <Calendar className="w-4 h-4" />
              Thời khóa biểu
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              aria-label={`${stat.label}: ${stat.value}`}
              className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="relative overflow-hidden h-full transition-all duration-200 hover:shadow-md hover:border-primary/40">
                <div className={cn('h-1 w-full', stat.accentBar)} />
                <CardContent className="p-4 sm:p-5 flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                      {stat.label}
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                      {stat.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <span className="truncate">{stat.sublabel}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                    </p>
                  </div>
                  <div
                    className={cn(
                      'w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
                      stat.iconClass
                    )}
                  >
                    <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column (7/12) */}
        <div className="xl:col-span-7 space-y-6">
          {/* Spotlight Next Session */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary shrink-0" />
                  Buổi học tiếp theo
                </CardTitle>
                {data.nextSession && (
                  <Badge
                    variant={nextIsLive ? 'default' : 'secondary'}
                    className={cn(
                      'font-medium gap-1.5',
                      nextIsLive &&
                        'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent'
                    )}
                  >
                    {nextIsLive && (
                      <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                    )}
                    <span suppressHydrationWarning>
                      {formatCountdown(data.nextSession, now)}
                    </span>
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {data.nextSession ? (
                <div
                  className="rounded-xl border p-4 bg-muted/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-muted/40"
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: data.nextSession.course?.color || '#3b82f6',
                  }}
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: data.nextSession.course?.color || '#3b82f6',
                        }}
                      />
                      <h3 className="font-semibold text-base leading-snug truncate">
                        {data.nextSession.course?.name}
                      </h3>
                      {data.nextSession.course?.courseCode && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {data.nextSession.course.courseCode}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <Clock className="w-4 h-4 text-primary" />
                        {normalizeTime(data.nextSession.startTime)} –{' '}
                        {normalizeTime(data.nextSession.endTime)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <CalendarDays className="w-4 h-4" />
                        {format(new Date(data.nextSession.date), 'EEEE, dd/MM/yyyy', {
                          locale: vi,
                        })}
                      </span>
                      {(data.nextSession.room || data.nextSession.location) && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {[
                            data.nextSession.room ? `P.${data.nextSession.room}` : null,
                            data.nextSession.location,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      )}
                      {data.nextSession.course?.instructor && (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="w-4 h-4" />
                          {data.nextSession.course.instructor}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSessionId(data.nextSession!.id)}
                    className="shrink-0 gap-1 self-start sm:self-center"
                  >
                    Chi tiết
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
                  <p className="text-sm font-medium">Không có buổi học sắp tới</p>
                  <p className="text-xs text-muted-foreground">
                    Thêm môn học hoặc kiểm tra học kỳ hiện tại để xem lịch học tiếp theo.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary shrink-0" />
                    Timeline lịch học hôm nay
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {data.todaySessions.length > 0
                      ? `Hôm nay có ${data.todaySessions.length} buổi học — nhấn vào buổi học để ghi chú hoặc xem checklist`
                      : 'Hôm nay bạn không có lịch học trên lớp'}
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href="/schedule" className="gap-1 text-xs">
                    Cả tuần
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.todaySessions.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 px-4 text-center space-y-2">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium">Hôm nay bạn trống lịch học</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Thời điểm lý tưởng để hoàn thành bài tập sắp đến hạn hoặc xem lại ghi chú bài giảng.
                  </p>
                </div>
              ) : (
                <div className="relative space-y-3">
                  {data.todaySessions.map((session, idx) => {
                    const color = session.course?.color || '#3b82f6';
                    const live = isSessionLive(session, now);
                    const isCompleted = session.status === 'completed';
                    const isCancelled = session.status === 'cancelled';
                    const isLast = idx === data.todaySessions.length - 1;

                    return (
                      <div key={session.id} className="relative flex gap-3 sm:gap-4">
                        {/* Time & Timeline Rail */}
                        <div className="flex flex-col items-center w-14 sm:w-16 shrink-0 pt-1">
                          <span className="text-xs font-semibold tabular-nums text-foreground">
                            {normalizeTime(session.startTime)}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {normalizeTime(session.endTime)}
                          </span>
                          <div className="relative flex-1 flex flex-col items-center mt-2">
                            <span
                              className={cn(
                                'w-2.5 h-2.5 rounded-full ring-4 ring-background z-10',
                                live && 'animate-pulse ring-primary/20'
                              )}
                              style={{
                                backgroundColor: isCancelled ? '#94a3b8' : color,
                              }}
                            />
                            {!isLast && (
                              <span className="w-px flex-1 bg-border mt-1 -mb-3" />
                            )}
                          </div>
                        </div>

                        {/* Session Card */}
                        <button
                          type="button"
                          onClick={() => setSelectedSessionId(session.id)}
                          className={cn(
                            'flex-1 min-w-0 text-left rounded-xl border p-3.5 transition-all hover:bg-accent/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            live && 'border-primary/60 bg-primary/5',
                            isCancelled && 'opacity-65'
                          )}
                          style={{
                            borderLeftWidth: '4px',
                            borderLeftColor: isCancelled ? '#94a3b8' : color,
                          }}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={cn(
                                    'font-semibold text-sm sm:text-base truncate',
                                    isCancelled && 'line-through'
                                  )}
                                >
                                  {session.course?.name}
                                </span>
                                {session.course?.courseCode && (
                                  <span className="text-xs font-mono text-muted-foreground">
                                    ({session.course.courseCode})
                                  </span>
                                )}
                                {session.type === 'makeup' && (
                                  <Badge variant="outline" className="text-[10px] h-5">
                                    Học bù
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {(session.room || session.location) && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {[
                                      session.room ? `Phòng ${session.room}` : null,
                                      session.location,
                                    ]
                                      .filter(Boolean)
                                      .join(' • ')}
                                  </span>
                                )}
                                {session.course?.instructor && (
                                  <span className="inline-flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    {session.course.instructor}
                                  </span>
                                )}
                              </div>
                            </div>

                            <Badge
                              variant={
                                live
                                  ? 'default'
                                  : isCompleted
                                    ? 'default'
                                    : isCancelled
                                      ? 'destructive'
                                      : 'secondary'
                              }
                              className={cn(
                                'self-start sm:self-center shrink-0 text-[11px]',
                                isCompleted &&
                                  !live &&
                                  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/25'
                              )}
                            >
                              {live
                                ? 'Đang diễn ra'
                                : SESSION_STATUS_LABELS[session.status] || session.status}
                            </Badge>
                          </div>
                        </button>
                      </div>
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
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary shrink-0" />
                    Tiến độ học kỳ
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Tỷ lệ buổi học đã hoàn thành trên tổng số buổi học của kỳ
                  </CardDescription>
                </div>
                <span className="text-2xl font-bold text-primary tabular-nums">
                  {progressPercentage}%
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress
                value={progressPercentage}
                className="h-2.5"
                aria-label={`Tiến độ học kỳ ${progressPercentage}%`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Đã hoàn thành{' '}
                  <strong className="text-foreground tabular-nums">
                    {data.completedSessionsCount}
                  </strong>{' '}
                  / {data.totalSessionsCount} buổi học
                </span>
                <span>
                  Còn lại{' '}
                  <strong className="text-foreground tabular-nums">
                    {Math.max(0, data.totalSessionsCount - data.completedSessionsCount)}
                  </strong>{' '}
                  buổi
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (5/12) */}
        <div className="xl:col-span-5 space-y-6">
          {/* Nearest Assignment Deadlines */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500 shrink-0" />
                  Deadline bài tập
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
                <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
                  <p className="text-sm font-medium">Không có bài tập tồn đọng</p>
                  <p className="text-xs text-muted-foreground">
                    Mọi bài tập đều đã hoàn thành hoặc chưa có hạn nộp mới.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.nearestDeadlines.map((item) => {
                    const dueInfo = getDueBadgeInfo(item.dueDate, now);
                    const priorityStyle =
                      PRIORITY_BADGE_STYLES[item.priority] ||
                      PRIORITY_BADGE_STYLES.medium;
                    return (
                      <Link
                        key={item.id}
                        href="/assignments"
                        className="block rounded-xl border p-3 hover:bg-accent/40 transition-colors space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm leading-snug line-clamp-2">
                            {item.title}
                          </p>
                          <span
                            className={cn(
                              'text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                              priorityStyle
                            )}
                          >
                            {PRIORITY_LABELS[item.priority] || item.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: item.course?.color || '#3b82f6',
                              }}
                            />
                            <span className="truncate">{item.course?.name}</span>
                          </span>
                          <span
                            suppressHydrationWarning
                            className={cn(
                              'px-2 py-0.5 rounded-md border text-[11px] font-medium shrink-0 tabular-nums',
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

          {/* Upcoming Exams */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-rose-500 shrink-0" />
                  Kỳ thi sắp tới
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/exams" className="text-xs gap-1">
                    Tất cả
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingExams.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
                  <p className="text-sm font-medium">Chưa có lịch thi sắp tới</p>
                  <p className="text-xs text-muted-foreground">
                    Thêm lịch thi giữa kỳ hoặc cuối kỳ để theo dõi đếm ngược ngày thi.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingExams.map((exam) => {
                    const countdown = getDueBadgeInfo(exam.date, now);
                    const typeStyle =
                      EXAM_BADGE_STYLES[exam.type] || EXAM_BADGE_STYLES.other;
                    return (
                      <Link
                        key={exam.id}
                        href="/exams"
                        className="block rounded-xl border p-3 hover:bg-accent/40 transition-colors space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm leading-snug truncate">
                              {exam.title}
                            </p>
                            {exam.course && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: exam.course.color || '#3b82f6',
                                  }}
                                />
                                <span className="truncate">{exam.course.name}</span>
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              'text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                              typeStyle
                            )}
                          >
                            {EXAM_TYPE_LABELS[exam.type] || exam.type}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <span className="tabular-nums font-medium text-foreground">
                              {formatShortDate(exam.date)}
                            </span>
                            {exam.startTime && (
                              <span className="tabular-nums">• {exam.startTime}</span>
                            )}
                            {exam.room && <span>• P.{exam.room}</span>}
                          </span>
                          <span
                            suppressHydrationWarning
                            className={cn(
                              'px-2 py-0.5 rounded-md border text-[11px] font-medium shrink-0',
                              countdown.className
                            )}
                          >
                            {countdown.label}
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
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <StickyNote className="w-5 h-5 text-emerald-500 shrink-0" />
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
              {recentNotesWithPreview.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
                  <p className="text-sm font-medium">Chưa có ghi chú buổi học</p>
                  <p className="text-xs text-muted-foreground">
                    Mở một buổi học bất kỳ để ghi lại nội dung bài giảng hoặc lưu ý cá nhân.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentNotesWithPreview.map(
                    ({ session: noteSession, preview, hasPersonal }) => {
                      const color = noteSession.course?.color || '#3b82f6';
                      return (
                        <button
                          key={noteSession.id}
                          type="button"
                          onClick={() => setSelectedSessionId(noteSession.id)}
                          className="w-full text-left block rounded-xl border p-3 hover:bg-accent/40 transition-colors space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-semibold truncate"
                              style={{ color }}
                            >
                              {hasPersonal ? (
                                <StickyNote className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span className="truncate">
                                {noteSession.course?.name}
                              </span>
                            </span>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                              {formatShortDate(noteSession.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {preview || 'Không có nội dung xem trước'}
                          </p>
                        </button>
                      );
                    }
                  )}
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
        onUpdated={() => {
          invalidateCache('/api/dashboard');
          fetchDashboard(true);
        }}
      />
    </div>
  );
}
