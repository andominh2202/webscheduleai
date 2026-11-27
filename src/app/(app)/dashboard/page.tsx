'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
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
  Plus,
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

function getGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
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
      className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
      isUrgent: true,
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Hôm nay',
      className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
      isUrgent: true,
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Ngày mai',
      className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      isUrgent: true,
    };
  }
  if (diffDays <= 3) {
    return {
      label: `Còn ${diffDays} ngày`,
      className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
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
      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2.5">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-8 w-64 rounded bg-muted" />
            <div className="h-4 w-52 rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-lg bg-muted" />
            <div className="h-9 w-28 rounded-lg bg-muted" />
          </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-5 w-44 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-28 rounded-xl bg-muted" />
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
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2.5">
              <div className="h-16 rounded-xl bg-muted" />
              <div className="h-16 rounded-xl bg-muted" />
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
      <Card className="max-w-lg mx-auto mt-8 border-destructive/30 shadow-sm">
        <CardContent className="p-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
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

  const formattedDate = format(now, "EEEE, 'ngày' dd 'tháng' MM, yyyy", { locale: vi });
  const greeting = getGreeting(now);

  const statCards = [
    {
      label: 'Số môn học',
      sublabel: data.activeSemester ? data.activeSemester.name : 'Tất cả học kỳ',
      value: data.coursesCount,
      icon: BookOpen,
      iconClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      href: '/courses',
    },
    {
      label: 'Buổi học tuần này',
      sublabel: `${data.todaySessions.length} buổi hôm nay`,
      value: data.weeklySessionsCount,
      icon: CalendarDays,
      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      href: '/schedule',
    },
    {
      label: 'Bài tập cần làm',
      sublabel:
        data.pendingAssignmentsCount > 0 ? 'Cần theo dõi hạn nộp' : 'Đã hoàn tất hết',
      value: data.pendingAssignmentsCount,
      icon: ClipboardList,
      iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      href: '/assignments',
    },
    {
      label: 'Kỳ thi sắp tới',
      sublabel: data.upcomingExamsCount > 0 ? 'Lịch thi đã lên' : 'Chưa có lịch thi',
      value: data.upcomingExamsCount,
      icon: GraduationCap,
      iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      href: '/exams',
    },
  ];

  const quickActions = [
    {
      label: 'Thời khóa biểu',
      description: 'Xem lịch tuần',
      href: '/schedule',
      icon: Calendar,
      iconClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Bài tập',
      description: 'Quản lý deadline',
      href: '/assignments',
      icon: ClipboardList,
      iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Kỳ thi',
      description: 'Lịch thi & phòng',
      href: '/exams',
      icon: GraduationCap,
      iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Ghi chú',
      description: 'Tổng hợp bài giảng',
      href: '/notes',
      icon: StickyNote,
      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Inline error banner when refresh fails with stale data */}
      {error && data && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-destructive hover:text-destructive"
            onClick={() => fetchDashboard(true)}
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* Hero / Welcome Header */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground capitalize">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                {formattedDate}
              </span>
              {data.activeSemester && (
                <Badge variant="secondary" className="font-medium text-xs">
                  {data.activeSemester.name}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {greeting}!
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              {data.todaySessions.length > 0
                ? `Hôm nay bạn có ${data.todaySessions.length} buổi học${
                    data.pendingAssignmentsCount > 0
                      ? ` và ${data.pendingAssignmentsCount} bài tập đang chờ.`
                      : '.'
                  }`
                : data.pendingAssignmentsCount > 0
                  ? `Hôm nay không có lịch học. Bạn có ${data.pendingAssignmentsCount} bài tập cần hoàn thành.`
                  : 'Hôm nay lịch học trống. Thời gian tuyệt vời để ôn tập hoặc nghỉ ngơi.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              Làm mới
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/schedule">
                <Calendar className="w-3.5 h-3.5" />
                Xem lịch học
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* KPI Stats Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="group block">
              <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/30">
                <CardContent className="p-4 sm:p-5 flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                      {stat.label}
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{stat.sublabel}</p>
                  </div>
                  <div
                    className={cn(
                      'h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105',
                      stat.iconClass
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Next Session, Today's Schedule, Semester Progress */}
        <div className="lg:col-span-7 space-y-6">
          {/* Next Session Spotlight */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Môn học tiếp theo</CardTitle>
                </div>
                {data.nextSession && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-medium',
                      isSessionLive(data.nextSession, now)
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-primary/30 bg-primary/5 text-primary'
                    )}
                  >
                    {isSessionLive(data.nextSession, now) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    )}
                    {formatCountdown(data.nextSession, now)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {data.nextSession ? (
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(data.nextSession!.id)}
                  className="w-full text-left group rounded-xl border bg-muted/30 hover:bg-muted/60 transition-colors p-4 flex items-start gap-3.5"
                >
                  <div
                    className="w-1.5 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: data.nextSession.course.color || '#3b82f6' }}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                          {data.nextSession.course.name}
                        </p>
                        {data.nextSession.course.courseCode && (
                          <p className="text-xs text-muted-foreground">
                            {data.nextSession.course.courseCode}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-primary/80" />
                        {formatShortDate(data.nextSession.date)} •{' '}
                        {normalizeTime(data.nextSession.startTime)} –{' '}
                        {normalizeTime(data.nextSession.endTime)}
                      </span>
                      {(data.nextSession.room || data.nextSession.location) && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary/80" />
                          {[data.nextSession.room, data.nextSession.location]
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      )}
                      {data.nextSession.course.instructor && (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-primary/80" />
                          {data.nextSession.course.instructor}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                  <p className="text-sm font-medium">Không có buổi học sắp tới</p>
                  <p className="text-xs text-muted-foreground">
                    Bạn đã hoàn thành các buổi học sắp tới hoặc chưa thêm lịch học.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg">Lịch học hôm nay</CardTitle>
                  <CardDescription className="text-xs">
                    {data.todaySessions.length > 0
                      ? `${data.todaySessions.length} buổi học trong ngày`
                      : 'Không có buổi học nào hôm nay'}
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                  <Link href="/schedule">
                    Toàn bộ lịch
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.todaySessions.length > 0 ? (
                <div className="space-y-2.5">
                  {data.todaySessions.map((session) => {
                    const live = isSessionLive(session, now);
                    const cancelled = session.status === 'cancelled';
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className={cn(
                          'w-full text-left group rounded-xl border p-3.5 transition-all flex items-center gap-3.5',
                          live
                            ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10'
                            : 'hover:bg-muted/50',
                          cancelled && 'opacity-60'
                        )}
                      >
                        <div className="w-16 shrink-0 text-center">
                          <p className="text-sm font-semibold tabular-nums">
                            {normalizeTime(session.startTime)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {normalizeTime(session.endTime)}
                          </p>
                        </div>

                        <div
                          className="w-1 h-10 rounded-full shrink-0"
                          style={{ backgroundColor: session.course.color || '#3b82f6' }}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                'font-medium text-sm truncate group-hover:text-primary transition-colors',
                                cancelled && 'line-through'
                              )}
                            >
                              {session.course.name}
                            </p>
                            {live && (
                              <Badge className="h-5 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white">
                                Đang học
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                            {(session.room || session.location) && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[session.room, session.location].filter(Boolean).join(' • ')}
                              </span>
                            )}
                            <span>
                              {SESSION_STATUS_LABELS[session.status] || session.status}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center space-y-3">
                  <Calendar className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Hôm nay không có lịch học</p>
                    <p className="text-xs text-muted-foreground">
                      Kiểm tra thời khóa biểu tuần hoặc thêm buổi học mới.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href="/schedule">
                      <Plus className="w-3.5 h-3.5" />
                      Mở thời khóa biểu
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Semester Progress */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Tiến độ học kỳ</CardTitle>
                </div>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {progressPercentage}%
                </span>
              </div>
              <CardDescription className="text-xs">
                {data.totalSessionsCount > 0
                  ? `Đã hoàn thành ${data.completedSessionsCount} / ${data.totalSessionsCount} buổi học`
                  : 'Chưa có dữ liệu buổi học trong học kỳ'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercentage} className="h-2.5" />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Quick Actions, Upcoming Exams, Deadlines, Recent Notes */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Actions */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Thao tác nhanh</CardTitle>
              <CardDescription className="text-xs">
                Truy cập nhanh các khu vực quản lý học tập
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2.5">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="group rounded-xl border p-3 hover:bg-muted/50 hover:border-primary/30 transition-all flex items-center gap-3"
                    >
                      <div
                        className={cn(
                          'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
                          action.iconClass
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {action.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {action.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Exams */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-rose-500" />
                  <CardTitle className="text-base sm:text-lg">Kỳ thi sắp tới</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                  <Link href="/exams">
                    Xem tất cả
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingExams.length > 0 ? (
                <div className="space-y-2.5">
                  {upcomingExams.map((exam) => {
                    const dueInfo = getDueBadgeInfo(exam.date, now);
                    return (
                      <Link
                        key={exam.id}
                        href="/exams"
                        className="block rounded-xl border p-3 hover:bg-muted/50 transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium line-clamp-1">{exam.title}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] shrink-0',
                              EXAM_BADGE_STYLES[exam.type] || EXAM_BADGE_STYLES.other
                            )}
                          >
                            {EXAM_TYPE_LABELS[exam.type] || exam.type}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">
                            {exam.course?.name || 'Môn học'} • {formatDate(exam.date)}
                            {exam.startTime ? ` (${normalizeTime(exam.startTime)})` : ''}
                          </span>
                          <Badge variant="outline" className={cn('text-[10px]', dueInfo.className)}>
                            {dueInfo.label}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-center space-y-1.5">
                  <GraduationCap className="w-7 h-7 text-muted-foreground/60 mx-auto" />
                  <p className="text-sm font-medium">Chưa có kỳ thi sắp tới</p>
                  <p className="text-xs text-muted-foreground">
                    Thêm lịch thi để theo dõi ngày thi và phòng thi.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nearest Deadlines */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-base sm:text-lg">Bài tập sắp đến hạn</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                  <Link href="/assignments">
                    Xem tất cả
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.nearestDeadlines.length > 0 ? (
                <div className="space-y-2.5">
                  {data.nearestDeadlines.map((assignment) => {
                    const dueInfo = getDueBadgeInfo(assignment.dueDate, now);
                    return (
                      <Link
                        key={assignment.id}
                        href="/assignments"
                        className="block rounded-xl border p-3 hover:bg-muted/50 transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium line-clamp-1">{assignment.title}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] shrink-0',
                              PRIORITY_BADGE_STYLES[assignment.priority] ||
                                PRIORITY_BADGE_STYLES.medium
                            )}
                          >
                            {PRIORITY_LABELS[assignment.priority] || assignment.priority}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{assignment.course.name}</span>
                          <Badge variant="outline" className={cn('text-[10px]', dueInfo.className)}>
                            {dueInfo.label}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-center space-y-1.5">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500/70 mx-auto" />
                  <p className="text-sm font-medium">Không có bài tập tồn đọng</p>
                  <p className="text-xs text-muted-foreground">
                    Tất cả bài tập hiện tại đã được hoàn thành.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Notes / Activity */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-500" />
                  <CardTitle className="text-base sm:text-lg">Ghi chú gần đây</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                  <Link href="/notes">
                    Mở ghi chú
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentNotesWithPreview.length > 0 ? (
                <div className="space-y-2.5">
                  {recentNotesWithPreview.map(({ session, preview }) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className="w-full text-left rounded-xl border p-3 hover:bg-muted/50 transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-primary truncate">
                          {session.course.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatShortDate(session.date)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{preview}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-center space-y-1.5">
                  <StickyNote className="w-7 h-7 text-muted-foreground/60 mx-auto" />
                  <p className="text-sm font-medium">Chưa có ghi chú nào</p>
                  <p className="text-xs text-muted-foreground">
                    Ghi chú buổi học sẽ hiển thị tại đây để bạn ôn tập nhanh.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Session Detail Panel */}
      {selectedSessionId && (
        <SessionDetailPanel
          sessionId={selectedSessionId}
          open={Boolean(selectedSessionId)}
          onClose={() => setSelectedSessionId(null)}
          onUpdated={() => {
            invalidateCache('/api/dashboard');
            fetchDashboard(true);
          }}
        />
      )}
    </div>
  );
}
