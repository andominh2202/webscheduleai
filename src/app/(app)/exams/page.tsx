'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  Clock,
  Edit,
  Eye,
  GraduationCap,
  History,
  ImagePlus,
  LayoutList,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { cn, EXAM_TYPE_LABELS } from '@/lib/utils';
import { getCached, invalidateCache, setCached } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import type { ExamCourseOption, ExamItem } from '@/components/exams/exam-form-dialog';
import { ExamDetailDialog } from '@/components/exams/exam-detail-dialog';
import { ExamCalendarView } from '@/components/exams/exam-calendar-view';

const ExamFormDialog = dynamic(
  () =>
    import('@/components/exams/exam-form-dialog').then((m) => m.ExamFormDialog),
  { ssr: false }
);

const ExamOcrDialog = dynamic(
  () =>
    import('@/components/exams/exam-ocr-dialog').then((m) => m.ExamOcrDialog),
  { ssr: false }
);

const EXAM_TYPE_BADGES: Record<string, string> = {
  quiz: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  midterm: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  final: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
  other: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
};

type ExamTimeTab = 'all' | 'upcoming' | 'past';
type ExamViewMode = 'list' | 'calendar';

function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function getStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDaysDiff(dateStr: string): number {
  const target = getStartOfDay(new Date(dateStr));
  const today = getStartOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function getCountdownBadge(daysDiff: number): {
  text: string;
  status: string;
  className: string;
} {
  if (daysDiff === 0) {
    return {
      text: 'Thi hôm nay!',
      status: 'Đang diễn ra',
      className:
        'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    };
  }
  if (daysDiff === 1) {
    return {
      text: 'Ngày mai',
      status: 'Sắp diễn ra',
      className:
        'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
    };
  }
  if (daysDiff > 1 && daysDiff <= 7) {
    return {
      text: `Còn ${daysDiff} ngày`,
      status: 'Sắp diễn ra',
      className:
        'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (daysDiff > 7) {
    return {
      text: `Còn ${daysDiff} ngày`,
      status: 'Sắp tới',
      className:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    };
  }
  return {
    text: `Đã qua ${Math.abs(daysDiff)} ngày`,
    status: 'Đã hoàn thành',
    className: 'bg-muted text-muted-foreground border-border',
  };
}

function ExamsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cachedCourses = getCached<ExamCourseOption[]>('/api/courses');
  const cachedExams = getCached<ExamItem[]>('/api/exams');

  const [exams, setExams] = React.useState<ExamItem[]>(() => cachedExams || []);
  const [courses, setCourses] = React.useState<ExamCourseOption[]>(
    () => cachedCourses || []
  );
  const [viewMode, setViewMode] = React.useState<ExamViewMode>('list');
  const [timeTab, setTimeTab] = React.useState<ExamTimeTab>('all');
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [loading, setLoading] = React.useState(() => !cachedExams);
  const [error, setError] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = React.useState(false);
  const [editingExam, setEditingExam] = React.useState<ExamItem | null>(null);
  const [detailExam, setDetailExam] = React.useState<ExamItem | null>(null);

  const [deletingExam, setDeletingExam] = React.useState<ExamItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchData = React.useCallback(async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setError(null);
    setExams((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });

    try {
      const [courseRes, examRes] = await Promise.all([
        fetch('/api/courses', { signal: ctrl.signal }),
        fetch('/api/exams', { signal: ctrl.signal }),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        const list = Array.isArray(cData) ? cData : [];
        setCourses(list);
        setCached('/api/courses', list);
      }

      if (examRes.ok) {
        const eData = await examRes.json();
        const list = Array.isArray(eData) ? eData : [];
        setExams(list);
        setCached('/api/exams', list);
      } else {
        setError('Không thể tải danh sách lịch thi');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError('Lỗi kết nối khi tải lịch thi');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    return () => {
      abortCtrlRef.current?.abort();
    };
  }, [fetchData]);

  React.useEffect(() => {
    const handleSemChange = () => fetchData();
    window.addEventListener('semester-changed', handleSemChange);
    return () => window.removeEventListener('semester-changed', handleSemChange);
  }, [fetchData]);

  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setEditingExam(null);
      setDialogOpen(true);
      router.replace('/exams');
    }
  }, [searchParams, router]);

  const handleConfirmDelete = async () => {
    if (!deletingExam || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/exams/${deletingExam.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`Đã xóa lịch thi "${deletingExam.title}"`);
      invalidateCache('/api/exams');
      invalidateCache('/api/dashboard');
      setDeletingExam(null);
      fetchData();
    } catch {
      toast.error('Xóa lịch thi thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const courseMap = React.useMemo(() => {
    const map = new Map<string, ExamCourseOption>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const { upcomingExams, pastExams, filteredAll } = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = exams.filter((e) => {
      if (courseFilter !== 'all' && e.courseId !== courseFilter) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q) {
        const course = e.course || courseMap.get(e.courseId);
        const courseName = course?.name || '';
        const courseCode = course?.courseCode || '';
        return (
          e.title.toLowerCase().includes(q) ||
          courseName.toLowerCase().includes(q) ||
          courseCode.toLowerCase().includes(q) ||
          (e.room && e.room.toLowerCase().includes(q)) ||
          (e.location && e.location.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q))
        );
      }
      return true;
    });

    const upcoming: ExamItem[] = [];
    const past: ExamItem[] = [];

    for (const item of filtered) {
      if (getDaysDiff(item.date) >= 0) {
        upcoming.push(item);
      } else {
        past.push(item);
      }
    }

    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      upcomingExams: upcoming,
      pastExams: past,
      filteredAll: [...upcoming, ...past],
    };
  }, [exams, courseFilter, typeFilter, debouncedSearch, courseMap]);

  const nextExam = upcomingExams[0] || null;

  const showUpcoming = timeTab === 'all' || timeTab === 'upcoming';
  const showPast = timeTab === 'all' || timeTab === 'past';
  const visibleCount =
    (showUpcoming ? upcomingExams.length : 0) + (showPast ? pastExams.length : 0);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    courseFilter !== 'all' ||
    typeFilter !== 'all' ||
    timeTab !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setCourseFilter('all');
    setTypeFilter('all');
    setTimeTab('all');
  };

  const renderExamCard = (exam: ExamItem, isUpcoming: boolean) => {
    const course = exam.course || courseMap.get(exam.courseId);
    const courseColor = course?.color || '#3b82f6';
    const examDate = new Date(exam.date);
    const daysDiff = getDaysDiff(exam.date);
    const countdown = getCountdownBadge(daysDiff);
    const typeLabel = EXAM_TYPE_LABELS[exam.type] || exam.type || 'Khác';
    const timeRange =
      exam.startTime && exam.endTime
        ? `${exam.startTime} – ${exam.endTime}`
        : exam.startTime || null;

    return (
      <div
        key={exam.id}
        role="button"
        tabIndex={0}
        onClick={() => setDetailExam(exam)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDetailExam(exam);
          }
        }}
        className={cn(
          'group flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border p-3.5 sm:p-4 bg-card transition-all cursor-pointer',
          'hover:bg-accent/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          !isUpcoming && 'opacity-75'
        )}
        style={{
          borderLeftWidth: '4px',
          borderLeftColor: isUpcoming ? courseColor : '#94a3b8',
        }}
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          {/* Date Block */}
          <div className="w-14 h-14 rounded-xl border bg-muted/40 flex flex-col items-center justify-center shrink-0 text-center">
            <span className="text-base font-bold leading-none tabular-nums">
              {format(examDate, 'dd')}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase mt-1">
              Th{format(examDate, 'MM')}
            </span>
          </div>

          {/* Main Info */}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {course?.courseCode && (
                <Badge variant="secondary" className="text-[11px] font-mono px-1.5 py-0">
                  {course.courseCode}
                </Badge>
              )}
              <span className="text-sm font-semibold truncate">
                {course?.name || 'Môn học'}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[11px] px-1.5 py-0',
                  EXAM_TYPE_BADGES[exam.type] || EXAM_TYPE_BADGES.other
                )}
              >
                {typeLabel}
              </Badge>
            </div>

            <p className="text-sm text-foreground/90 font-medium truncate">
              {exam.title}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 capitalize">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {format(examDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
              </span>
              {timeRange && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {timeRange}
                </span>
              )}
              {(exam.room || exam.location) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[exam.room ? `P.${exam.room}` : null, exam.location]
                    .filter(Boolean)
                    .join(' • ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Countdown, Status & Actions */}
        <div
          className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn('text-xs font-medium', countdown.className)}
            >
              {countdown.text}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Xem chi tiết"
              onClick={() => setDetailExam(exam)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Chỉnh sửa lịch thi"
              onClick={() => {
                setEditingExam(exam);
                setDialogOpen(true);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="Xóa lịch thi"
              onClick={() => setDeletingExam(exam)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <GraduationCap className="h-7 w-7 text-primary shrink-0" />
            Lịch thi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi ngày thi, ca thi, phòng thi và thời gian đếm ngược cho từng học phần.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOcrDialogOpen(true)}
            className="gap-1.5"
          >
            <ImagePlus className="h-4 w-4" />
            Import ảnh / OCR
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditingExam(null);
              setDialogOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Thêm lịch thi
          </Button>
        </div>
      </div>

      {/* Next Exam Spotlight */}
      {!loading && !error && nextExam && (
        <Card
          className="border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setDetailExam(nextExam)}
        >
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground gap-1 text-xs">
                    <Sparkles className="h-3 w-3" />
                    Kỳ thi sắp tới gần nhất
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-semibold',
                      getCountdownBadge(getDaysDiff(nextExam.date)).className
                    )}
                  >
                    {getCountdownBadge(getDaysDiff(nextExam.date)).text}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-lg sm:text-xl font-bold truncate">
                    {(nextExam.course || courseMap.get(nextExam.courseId))?.name ||
                      nextExam.title}
                  </h2>
                  {(nextExam.course || courseMap.get(nextExam.courseId))?.courseCode && (
                    <span className="text-xs font-mono text-muted-foreground">
                      ({(nextExam.course || courseMap.get(nextExam.courseId))?.courseCode})
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  {nextExam.title} •{' '}
                  {EXAM_TYPE_LABELS[nextExam.type] || nextExam.type}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm shrink-0">
                <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">Ngày thi</p>
                    <p className="font-semibold">
                      {format(new Date(nextExam.date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
                {nextExam.startTime && (
                  <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Giờ thi</p>
                      <p className="font-semibold tabular-nums">
                        {nextExam.startTime}
                        {nextExam.endTime ? ` – ${nextExam.endTime}` : ''}
                      </p>
                    </div>
                  </div>
                )}
                {nextExam.room && (
                  <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Phòng thi</p>
                      <p className="font-semibold">{nextExam.room}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar: View Switch, Filters, Search */}
      <Card>
        <CardContent className="p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* View Mode + Time Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                <Button
                  type="button"
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2.5 gap-1.5"
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList className="h-4 w-4" />
                  Danh sách
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2.5 gap-1.5"
                  onClick={() => setViewMode('calendar')}
                >
                  <CalendarDays className="h-4 w-4" />
                  Lịch
                </Button>
              </div>

              {viewMode === 'list' && (
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  {(
                    [
                      { key: 'all', label: `Tất cả (${exams.length})` },
                      { key: 'upcoming', label: `Sắp tới (${upcomingExams.length})` },
                      { key: 'past', label: `Đã qua (${pastExams.length})` },
                    ] as const
                  ).map((tab) => (
                    <Button
                      key={tab.key}
                      type="button"
                      variant={timeTab === tab.key ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setTimeTab(tab.key)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Search & Dropdown Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 lg:max-w-2xl lg:justify-end">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm môn, mã HP, phòng thi..."
                  className="pl-8 pr-8 h-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Xóa tìm kiếm"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[170px]">
                  <SelectValue placeholder="Tất cả môn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả môn học</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.courseCode ? `${c.courseCode} - ${c.name}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[145px]">
                  <SelectValue placeholder="Hình thức" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mọi hình thức</SelectItem>
                  <SelectItem value="final">Thi cuối kỳ</SelectItem>
                  <SelectItem value="midterm">Thi giữa kỳ</SelectItem>
                  <SelectItem value="quiz">Kiểm tra</SelectItem>
                  <SelectItem value="other">Khác</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2.5 text-muted-foreground"
                  onClick={resetFilters}
                >
                  Đặt lại
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content States: Loading / Error / Empty / Data */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                Vui lòng kiểm tra kết nối mạng và thử tải lại.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : visibleCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">
                {hasActiveFilters
                  ? 'Không tìm thấy lịch thi phù hợp'
                  : 'Chưa có lịch thi nào'}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {hasActiveFilters
                  ? 'Thử xóa bộ lọc để xem toàn bộ lịch thi của bạn.'
                  : 'Nhấn "Thêm lịch thi" hoặc "Import ảnh / OCR" để bắt đầu theo dõi.'}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Xóa bộ lọc
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOcrDialogOpen(true)}
                >
                  <ImagePlus className="h-4 w-4 mr-1.5" />
                  Import ảnh / OCR
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditingExam(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Thêm lịch thi
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'calendar' ? (
        <ExamCalendarView
          exams={filteredAll}
          courseMap={courseMap}
          onSelectExam={(exam) => setDetailExam(exam)}
        />
      ) : (
        <div className="space-y-6">
          {/* Upcoming Exams */}
          {showUpcoming && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary shrink-0" />
                  Lịch thi sắp tới ({upcomingExams.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {upcomingExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Không có lịch thi sắp tới.
                  </p>
                ) : (
                  upcomingExams.map((exam) => renderExamCard(exam, true))
                )}
              </CardContent>
            </Card>
          )}

          {/* Past Exams */}
          {showPast && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                  <History className="h-5 w-5 shrink-0" />
                  Lịch thi đã qua ({pastExams.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {pastExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Chưa có lịch thi nào đã qua.
                  </p>
                ) : (
                  pastExams.map((exam) => renderExamCard(exam, false))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <ExamDetailDialog
        exam={detailExam}
        course={detailExam ? courseMap.get(detailExam.courseId) : undefined}
        open={Boolean(detailExam)}
        onOpenChange={(open) => !open && setDetailExam(null)}
        onEdit={(exam) => {
          setEditingExam(exam);
          setDialogOpen(true);
        }}
        onDelete={(exam) => setDeletingExam(exam)}
      />

      {/* Add / Edit Dialog */}
      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        exam={editingExam}
        courses={courses}
        onSaved={() => {
          invalidateCache('/api/exams');
          invalidateCache('/api/dashboard');
          fetchData();
        }}
      />

      {/* OCR Import Exam Dialog */}
      {ocrDialogOpen && (
        <ExamOcrDialog
          open={ocrDialogOpen}
          onOpenChange={setOcrDialogOpen}
          courses={courses}
          onSaved={() => {
            invalidateCache('/api/exams');
            invalidateCache('/api/dashboard');
            fetchData();
          }}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deletingExam)}
        onOpenChange={(open) => !open && setDeletingExam(null)}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa lịch thi</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa lịch thi{' '}
              <span className="font-semibold text-foreground">
                {deletingExam?.title}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingExam(null)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Đang xóa...' : 'Xóa lịch thi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ExamsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Đang tải danh sách lịch thi...
        </div>
      }
    >
      <ExamsPageContent />
    </Suspense>
  );
}
